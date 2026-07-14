/**
 * wave_simulation.js
 * 水面波シミュレーション物理演算・描画エンジン
 */

class WaveSimulation {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.W = this.canvas.width;
    this.H = this.canvas.height;

    // シミュレーショングリッド設定 (4x4ピクセルを1グリッドとする)
    this.scale = 4;
    this.cols = Math.floor(this.W / this.scale); // 175
    this.rows = Math.floor(this.H / this.scale); // 105
    this.gridSize = this.cols * this.rows;

    // 物理パラメータ初期値
    this.params = {
      amplitude: 5.0,    // 振幅
      speed: 0.50,       // 伝播速度 (波動方程式のc)
      frequency: 2.0,   // 周波数 (Hz)
      viscosity: 0.986,  // 粘度 (減衰係数d)
      wallReflection: true, // 枠を壁扱いするかどうか
    };

    // シミュレーション用配列
    this.u_prev = new Float32Array(this.gridSize);
    this.u_curr = new Float32Array(this.gridSize);
    this.u_next = new Float32Array(this.gridSize);
    this.obstacles = new Uint8Array(this.gridSize);

    // 境界の吸収係数配列 (端に近いほど強く減衰させる)
    this.boundaryDamping = new Float32Array(this.gridSize);
    this._initBoundaryDamping();

    // 波源設定 (点波源を左側中央に配置)
    this.sourceX = Math.floor(this.cols / 4);
    this.sourceY = Math.floor(this.rows / 2);
    this.t = 0;

    // 高速描画用のオフスクリーンキャンバス
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.cols;
    this.offscreenCanvas.height = this.rows;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    this.imgData = this.offscreenCtx.createImageData(this.cols, this.rows);

    this.isAnimating = false;
    this.animFrame = null;

    this.clear();
    this.draw();
  }

  /** パラメータの設定 */
  setParams(newParams) {
    this.params = { ...this.params, ...newParams };
  }

  /** シミュレーション変位配列のクリア */
  clear() {
    this.u_prev.fill(0);
    this.u_curr.fill(0);
    this.u_next.fill(0);
    this.t = 0;
  }

  /** 障害物の全消去 */
  clearObstacles() {
    this.obstacles.fill(0);
  }

  /** 境界付近の減衰率を設定 (吸収境界条件の近似) */
  _initBoundaryDamping() {
    const border = 6; // 減衰を適用する外周幅
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const idx = y * this.cols + x;
        let dist = Math.min(x, y, this.cols - 1 - x, this.rows - 1 - y);
        if (dist < border) {
          // 端に近づくほど減衰を強くする (1.0 -> 0.85)
          const factor = dist / border;
          this.boundaryDamping[idx] = 0.85 + factor * 0.15;
        } else {
          this.boundaryDamping[idx] = 1.0;
        }
      }
    }
  }

  /** シミュレーションステップの更新 (波動方程式の差分法) */
  update() {
    const { cols, rows, u_prev, u_curr, u_next, obstacles, boundaryDamping } = this;
    const c = this.params.speed; // 波の速さ (通常 0.1 ~ 1.0)
    // 安定性を保つための係数 (cの値が大きい時に発散するのを防止)
    const c_sq = c * c * 0.5; 
    const damping = this.params.viscosity; // 基本の減衰 (粘度)
    
    this.t += 0.15; // 時間経過

    // 1. 点波源から波を励起 (正弦波)
    const sourceIdx = this.sourceY * cols + this.sourceX;
    if (!obstacles[sourceIdx]) {
      // 振幅と周波数に基づき現在の波高を設定
      u_curr[sourceIdx] = Math.sin(this.t * this.params.frequency) * this.params.amplitude;
    }

    // 2. 2次元離散波動方程式の演算
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const idx = y * cols + x;

        // 障害物内は常に波高0
        if (obstacles[idx]) {
          u_next[idx] = 0;
          continue;
        }

        // 周囲4グリッドの変位の和
        const neighbors = u_curr[idx + 1] + u_curr[idx - 1] + u_curr[idx + cols] + u_curr[idx - cols];
        
        // 差分計算
        let val = 2 * u_curr[idx] - u_prev[idx] + c_sq * (neighbors - 4 * u_curr[idx]);
        
        // 液体の粘度 (基本減衰) と 吸収境界条件の減衰を掛け算
        let bd = this.params.wallReflection === false ? boundaryDamping[idx] : 1.0;
        u_next[idx] = val * damping * bd;
      }
    }

    // 境界の処理
    if (this.params.wallReflection === false) {
      for (let x = 0; x < cols; x++) {
        u_next[x] = u_curr[cols + x];
        u_next[(rows - 1) * cols + x] = u_curr[(rows - 2) * cols + x];
      }
      for (let y = 0; y < rows; y++) {
        u_next[y * cols] = u_curr[y * cols + 1];
        u_next[y * cols + cols - 1] = u_curr[y * cols + cols - 2];
      }
      // コーナーの処理
      u_next[0] = u_curr[cols + 1];
      u_next[cols - 1] = u_curr[2 * cols - 2];
      u_next[(rows - 1) * cols] = u_curr[(rows - 2) * cols + 1];
      u_next[(rows - 1) * cols + cols - 1] = u_curr[(rows - 2) * cols + cols - 2];
    } else {
      for (let x = 0; x < cols; x++) {
        u_next[x] = 0;
        u_next[(rows - 1) * cols + x] = 0;
      }
      for (let y = 0; y < rows; y++) {
        u_next[y * cols] = 0;
        u_next[y * cols + cols - 1] = 0;
      }
    }

    // 3. 配列のローテーション (prev <- curr <- next)
    u_prev.set(u_curr);
    u_curr.set(u_next);
  }

  /** 描画処理 */
  draw() {
    const { cols, rows, u_curr, obstacles, imgData, ctx, W, H } = this;
    const data = imgData.data;

    const baseColor = { r: 10, g: 14, b: 26 }; // 背景色 (#0A0E1A)
    const obstacleColor = { r: 30, g: 58, b: 95 }; // 障害物色 (#1E3A5F)
    
    // 最大変位の基準スケール (描画の色マッピング用)
    // 小さな波でも見分けやすいよう、明度を非線形に強調する。
    const colorScale = this.params.amplitude * 0.30;

    for (let i = 0; i < this.gridSize; i++) {
      const px = i * 4;

      if (obstacles[i]) {
        // 障害物の描画
        data[px]     = obstacleColor.r;
        data[px + 1] = obstacleColor.g;
        data[px + 2] = obstacleColor.b;
        data[px + 3] = 255;
        continue;
      }

      const val = u_curr[i];
      if (val > 0) {
        // 正の変位: シアン系 (明るい水色)
        const intensity = Math.sqrt(Math.min(1, val / colorScale));
        data[px]     = Math.floor(baseColor.r + (0 - baseColor.r) * intensity);
        data[px + 1] = Math.floor(baseColor.g + (212 - baseColor.g) * intensity);
        data[px + 2] = Math.floor(baseColor.b + (255 - baseColor.b) * intensity);
      } else {
        // 負の変位: ディープブルー系 (暗い青)
        const intensity = Math.sqrt(Math.min(1, -val / colorScale));
        data[px]     = Math.floor(baseColor.r + (20 - baseColor.r) * intensity);
        data[px + 1] = Math.floor(baseColor.g + (40 - baseColor.g) * intensity);
        data[px + 2] = Math.floor(baseColor.b + (180 - baseColor.b) * intensity);
      }
      data[px + 3] = 255; // Alpha
    }

    // オフスクリーンキャンバスにピクセル情報を書き込み
    this.offscreenCtx.putImageData(imgData, 0, 0);

    // メインキャンバスをクリア
    ctx.clearRect(0, 0, W, H);
    
    // オフスクリーンキャンバスを引き伸ばして描画 (自動的にバイリニア補間され、滑らかになる)
    ctx.drawImage(this.offscreenCanvas, 0, 0, W, H);

    // 波源マークの描画 (小さなシアン色の円)
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.sourceX * this.scale, this.sourceY * this.scale, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#00D4FF';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00D4FF';
    ctx.fill();
    ctx.restore();
  }

  /** 障害物の追加 (Canvas座標からグリッド座標へ変換して描画) */
  addObstacle(canvasX, canvasY, radius = 2) {
    const gx = Math.floor(canvasX / this.scale);
    const gy = Math.floor(canvasY / this.scale);

    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        const nx = gx + x;
        const ny = gy + y;
        if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) {
          if (x * x + y * y <= radius * radius) {
            const idx = ny * this.cols + nx;
            // 波源の位置は障害物で上書きしない
            if (nx !== this.sourceX || ny !== this.sourceY) {
              this.obstacles[idx] = 1;
              this.u_curr[idx] = 0;
              this.u_prev[idx] = 0;
            }
          }
        }
      }
    }
    if (!this.isAnimating) this.draw();
  }

  /** 障害物の消去 */
  removeObstacle(canvasX, canvasY, radius = 3) {
    const gx = Math.floor(canvasX / this.scale);
    const gy = Math.floor(canvasY / this.scale);

    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        const nx = gx + x;
        const ny = gy + y;
        if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) {
          if (x * x + y * y <= radius * radius) {
            const idx = ny * this.cols + nx;
            this.obstacles[idx] = 0;
          }
        }
      }
    }
    if (!this.isAnimating) this.draw();
  }

  /** 障害物プリセットの設定 */
  setPreset(preset) {
    this.clearObstacles();
    this.clear();

    const midX = Math.floor(this.cols / 2);
    const midY = Math.floor(this.rows / 2);

    switch (preset) {
      case 'slit':
        // 単一スリット (中央に壁を作り、スリットを1つ空ける)
        for (let y = 0; y < this.rows; y++) {
          // スリット幅 (スリットの隙間: midY - 6 から midY + 6 まで)
          if (Math.abs(y - midY) > 6) {
            this.obstacles[y * this.cols + midX] = 1;
          }
        }
        break;

      case 'double-slit':
        // 二重スリット (中央に壁を作り、2か所のスリットを空ける)
        for (let y = 0; y < this.rows; y++) {
          const distFromCenter = Math.abs(y - midY);
          // スリット幅: 中心から離れた2つの位置にスリットを配置
          if (!(distFromCenter >= 8 && distFromCenter <= 13)) {
            this.obstacles[y * this.cols + midX] = 1;
          }
        }
        break;

      case 'pillar':
        // 円柱障害物 (中央右寄りに丸い円柱を設置)
        const pillarX = Math.floor(this.cols * 0.6);
        const pillarY = midY;
        const radius = 10;
        for (let y = 0; y < this.rows; y++) {
          for (let x = 0; x < this.cols; x++) {
            const dx = x - pillarX;
            const dy = y - pillarY;
            if (dx * dx + dy * dy <= radius * radius) {
              this.obstacles[y * this.cols + x] = 1;
            }
          }
        }
        break;

      case 'clear':
      default:
        // 全消去 (何もしない)
        break;
    }

    this.draw();
  }

  /** 障害物があるかどうかを判定 (ログ記録用) */
  hasObstacles() {
    for (let i = 0; i < this.gridSize; i++) {
      if (this.obstacles[i] === 1) return true;
    }
    return false;
  }

  /** アニメーション開始 */
  run() {
    this.isAnimating = true;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this._loop();
  }

  /** アニメーション停止 */
  stop() {
    this.isAnimating = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  _loop() {
    if (!this.isAnimating) return;
    this.update();
    this.draw();
    this.animFrame = requestAnimationFrame(() => this._loop());
  }
}
