/**
 * simulation.js
 * 光の屈折シミュレーション物理エンジン
 */

class RefractionSimulation {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.W = this.canvas.width;
    this.H = this.canvas.height;
    this.animFrame = null;
    this.animProgress = 0;
    this.isAnimating = false;

    // 現在のパラメータ
    this.params = {
      theta1: 45,   // 入射角 (度)
      n1: 1.00,
      n2: 1.50,
    };

    // 境界面のY座標
    this.boundaryY = this.H / 2;
    // 光線の起点 X
    this.originX = this.W / 2;

    this.draw(this.params);
  }

  /** スネルの法則で屈折角を計算 (度) */
  calcRefraction(theta1_deg, n1, n2) {
    const theta1 = theta1_deg * Math.PI / 180;
    const sinTheta2 = (n1 / n2) * Math.sin(theta1);
    if (Math.abs(sinTheta2) > 1) return null; // 全反射
    return Math.asin(sinTheta2) * 180 / Math.PI;
  }

  /** アニメーション付きでシミュレーションを実行 */
  run(params) {
    this.params = { ...params };
    this.animProgress = 0;
    this.isAnimating = true;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this._animate();
  }

  _animate() {
    this.animProgress = Math.min(1, this.animProgress + 0.035);
    this.draw(this.params, this.animProgress);
    if (this.animProgress < 1) {
      this.animFrame = requestAnimationFrame(() => this._animate());
    } else {
      this.isAnimating = false;
    }
  }

  /** キャンバス描画 */
  draw(params, progress = 1) {
    const { ctx, W, H, boundaryY, originX } = this;
    const { theta1, n1, n2 } = params;

    ctx.clearRect(0, 0, W, H);

    // ── 背景：媒質1 / 媒質2 ──
    const grad1 = ctx.createLinearGradient(0, 0, 0, boundaryY);
    grad1.addColorStop(0, 'rgba(0,14,40,0.95)');
    grad1.addColorStop(1, 'rgba(0,30,60,0.95)');
    ctx.fillStyle = grad1;
    ctx.fillRect(0, 0, W, boundaryY);

    const grad2 = ctx.createLinearGradient(0, boundaryY, 0, H);
    grad2.addColorStop(0, 'rgba(20,10,40,0.95)');
    grad2.addColorStop(1, 'rgba(10,5,25,0.95)');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, boundaryY, W, H - boundaryY);

    // ── 媒質ラベル ──
    ctx.font = '500 13px "JetBrains Mono"';
    ctx.fillStyle = 'rgba(136,153,187,0.7)';
    ctx.fillText(`媒質 1  (n₁ = ${n1.toFixed(2)})`, 18, 28);
    ctx.fillText(`媒質 2  (n₂ = ${n2.toFixed(2)})`, 18, boundaryY + 28);

    // ── 境界面 ──
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(0,212,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, boundaryY);
    ctx.lineTo(W, boundaryY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ── 法線 ──
    ctx.save();
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(74,85,104,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(originX, boundaryY - 160);
    ctx.lineTo(originX, boundaryY + 160);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ── 法線ラベル ──
    ctx.font = '11px "JetBrains Mono"';
    ctx.fillStyle = 'rgba(74,85,104,0.8)';
    ctx.fillText('法線', originX + 8, boundaryY - 148);

    // 角度をラジアンに変換
    const theta1Rad = theta1 * Math.PI / 180;
    const theta2Deg = this.calcRefraction(theta1, n1, n2);
    const isTIR = theta2Deg === null;

    // ── 入射光線の長さと到達点 ──
    const rayLen = 160;
    // 入射光は左上から境界面の originX に向かう（法線から theta1 傾ける）
    const incidentStartX = originX - Math.sin(theta1Rad) * rayLen;
    const incidentStartY = boundaryY - Math.cos(theta1Rad) * rayLen;

    // ── 入射光線 ──
    const incidentEnd = progress; // 0→1 で伸びる
    this._drawRay(
      incidentStartX + (originX - incidentStartX) * (1 - incidentEnd),
      incidentStartY + (boundaryY - incidentStartY) * (1 - incidentEnd),
      originX, boundaryY,
      '#00D4FF', 2.5, true,
      Math.min(1, progress * 2)
    );

    // ── 角度弧：入射角 ──
    if (progress > 0.4) {
      const arcAlpha = Math.max(0, (progress - 0.4) / 0.3);
      this._drawAngleArc(originX, boundaryY, 50, Math.PI * 1.5, Math.PI * 1.5 + theta1Rad, '#00D4FF', arcAlpha);
      if (arcAlpha > 0.8 && theta1 > 2) {
        ctx.save();
        ctx.globalAlpha = arcAlpha;
        ctx.fillStyle = '#00D4FF';
        ctx.font = '600 12px "JetBrains Mono"';
        const lx = originX - 62 * Math.sin(theta1Rad / 2);
        const ly = boundaryY - 62 * Math.cos(theta1Rad / 2);
        ctx.fillText(`θ₁=${theta1.toFixed(1)}°`, lx - 28, ly);
        ctx.restore();
      }
    }

    if (!isTIR) {
      const theta2Rad = theta2Deg * Math.PI / 180;
      const refractedProgress = Math.max(0, (progress - 0.5) / 0.5);

      // ── 屈折光線 ──
      const refEndX = originX + Math.sin(theta2Rad) * rayLen * refractedProgress;
      const refEndY = boundaryY + Math.cos(theta2Rad) * rayLen * refractedProgress;

      this._drawRay(
        originX, boundaryY, refEndX, refEndY,
        '#FF6B35', 2.5, false,
        refractedProgress
      );

      // ── 角度弧：屈折角 ──
      if (refractedProgress > 0.5) {
        const arcAlpha2 = Math.max(0, (refractedProgress - 0.5) / 0.3);
        this._drawAngleArc(originX, boundaryY, 50, Math.PI * 0.5, Math.PI * 0.5 + theta2Rad, '#FF6B35', arcAlpha2);
        if (arcAlpha2 > 0.8 && theta2Deg > 1) {
          ctx.save();
          ctx.globalAlpha = arcAlpha2;
          ctx.fillStyle = '#FF6B35';
          ctx.font = '600 12px "JetBrains Mono"';
          const lx2 = originX + 68 * Math.sin(theta2Rad / 2);
          const ly2 = boundaryY + 68 * Math.cos(theta2Rad / 2);
          ctx.fillText(`θ₂=${theta2Deg.toFixed(1)}°`, lx2 + 4, ly2);
          ctx.restore();
        }
      }

      // 反射光（薄く）
      if (progress > 0.6) {
        const reflAlpha = 0.25 * Math.max(0, (progress - 0.6) / 0.4);
        const reflEndX = originX + Math.sin(theta1Rad) * 80 * Math.max(0, (progress - 0.6) / 0.4);
        const reflEndY = boundaryY - Math.cos(theta1Rad) * 80 * Math.max(0, (progress - 0.6) / 0.4);
        this._drawRay(originX, boundaryY, reflEndX, reflEndY, '#00D4FF', 1, false, reflAlpha);
      }

    } else {
      // ── 全反射 ──
      const refProgress = Math.max(0, (progress - 0.5) / 0.5);
      const reflEndX = originX + Math.sin(theta1Rad) * rayLen * refProgress;
      const reflEndY = boundaryY - Math.cos(theta1Rad) * rayLen * refProgress;
      this._drawRay(originX, boundaryY, reflEndX, reflEndY, '#FFB800', 2.5, false, refProgress);

      if (refProgress > 0.5) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, (refProgress - 0.5) / 0.3);
        ctx.fillStyle = '#FFB800';
        ctx.font = '600 13px "JetBrains Mono"';
        ctx.fillText('全反射', originX + 14, boundaryY - 80);
        ctx.restore();
      }
    }

    // ── 衝突点 ──
    if (progress > 0.45) {
      const ptAlpha = Math.max(0, (progress - 0.45) / 0.2);
      ctx.save();
      ctx.globalAlpha = ptAlpha;
      ctx.beginPath();
      ctx.arc(originX, boundaryY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00D4FF';
      ctx.fill();
      ctx.restore();
    }

    return { theta2Deg, isTIR };
  }

  /** 光線を描画（グロー付き） */
  _drawRay(x1, y1, x2, y2, color, width, isIncident, alpha = 1) {
    if (alpha <= 0) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;

    // グロー
    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // コア
    ctx.shadowBlur = 4;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = width * 0.35;
    ctx.globalAlpha = alpha * 0.6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.restore();
  }

  /** 角度弧を描画 */
  _drawAngleArc(cx, cy, r, startAngle, endAngle, color, alpha) {
    if (alpha <= 0 || Math.abs(endAngle - startAngle) < 0.01) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /** 計算のみ（UIバッジ更新用） */
  compute(theta1, n1, n2) {
    const theta2 = this.calcRefraction(theta1, n1, n2);
    return { theta2, isTIR: theta2 === null };
  }
}
