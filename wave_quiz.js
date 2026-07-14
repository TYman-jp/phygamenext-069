/**
 * wave_quiz.js
 * ヤングの二重スリット実験を利用した水面波クイズクラス
 */

class WaveQuiz {
  constructor(waveSimulation) {
    this.sim = waveSimulation;
    this.current = null;
    
    // スリットの座標設定 (wave_simulation.jsの 'double-slit' プリセットに基づく)
    this.slitX = Math.floor(this.sim.cols / 2);
    this.midY = Math.floor(this.sim.rows / 2);
    
    // 二重スリットの隙間は中心から 10.5 の位置
    this.slit1Y = this.midY - 10.5;
    this.slit2Y = this.midY + 10.5;
  }

  generate() {
    // プリセットを自動設定
    this.sim.setPreset('double-slit');

    // ランダムな的の生成 (xは 130〜150, yは 20〜85)
    const targetX = 130 + Math.random() * 20;
    const targetY = 20 + Math.random() * 65;

    // 問題タイプ (強め合う: true, 弱め合う: false)
    const isConstructive = Math.random() > 0.5;
    const conditionText = isConstructive ? '強め合う点（腹）' : '弱め合う点（節）';

    const targetGrid = { x: targetX, y: targetY };
    
    // Canvas座標に変換
    const targetCanvas = {
      x: targetX * this.sim.scale,
      y: targetY * this.sim.scale,
      radius: 10 // 描画用の半径
    };

    const sample = this._calculateSampleSolution(targetGrid, isConstructive);

    this.current = {
      targetGrid,
      targetCanvas,
      isConstructive,
      conditionText,
      sampleSolution: sample
    };

    this.sim.setTarget(targetCanvas);
    return this.current;
  }

  _calculateSampleSolution(target, isConstructive) {
    const dist1 = Math.hypot(target.x - this.slitX, target.y - this.slit1Y);
    const dist2 = Math.hypot(target.x - this.slitX, target.y - this.slit2Y);
    const deltaL = Math.abs(dist1 - dist2);

    const m = Math.random() > 0.5 ? 1 : 2;
    const pathDiff = isConstructive ? m : (m + 0.5);

    const requiredLambda = deltaL / pathDiff;
    const ratio = requiredLambda / 41.89;

    let f = 2.0;
    let c = ratio * f;

    if (c > 1.0) {
      c = 1.0;
      f = c / ratio;
    } else if (c < 0.2) {
      c = 0.3;
      f = c / ratio;
    }

    if (f > 5.0) f = 5.0;
    if (f < 0.5) f = 0.5;
    
    c = ratio * f;

    return {
      c: Number(c.toFixed(2)),
      f: Number(f.toFixed(1))
    };
  }

  evaluate(params) {
    if (!this.current) {
      return { status: 'none', message: '先に問題を生成してください。' };
    }

    const { speed, frequency } = params;
    const lambda = 41.89 * (speed / frequency);

    const dist1 = Math.hypot(this.current.targetGrid.x - this.slitX, this.current.targetGrid.y - this.slit1Y);
    const dist2 = Math.hypot(this.current.targetGrid.x - this.slitX, this.current.targetGrid.y - this.slit2Y);
    const deltaL = Math.abs(dist1 - dist2);

    const phaseDiff = 2 * Math.PI * (deltaL / lambda);

    let diffFromTarget = 0;
    if (this.current.isConstructive) {
      const m = Math.round(phaseDiff / (2 * Math.PI));
      diffFromTarget = Math.abs(phaseDiff - m * 2 * Math.PI);
    } else {
      const m = Math.floor(phaseDiff / (2 * Math.PI));
      const targetPhase1 = m * 2 * Math.PI + Math.PI;
      const targetPhase2 = (m + 1) * 2 * Math.PI + Math.PI;
      diffFromTarget = Math.min(Math.abs(phaseDiff - targetPhase1), Math.abs(phaseDiff - targetPhase2));
    }

    const errorDeg = (diffFromTarget / Math.PI) * 180;
    const isCorrect = errorDeg <= 45;

    return {
      status: isCorrect ? 'correct' : 'miss',
      message: isCorrect
        ? `正解です！ 理想的な条件との位相誤差はわずか ${errorDeg.toFixed(1)}° です。`
        : `不正解です。指定の干渉条件から ${errorDeg.toFixed(1)}°（位相）ズレています。`,
      errorDeg
    };
  }

  revealAnswer() {
    if (!this.current) return '先に問題を生成してください。';
    const a = this.current.sampleSolution;
    return `答えの一例: 波の速さ=${a.c.toFixed(2)} / 周波数=${a.f.toFixed(1)}Hz`;
  }
}
