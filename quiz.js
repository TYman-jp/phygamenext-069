/**
 * quiz.js
 * 屈折光を的に当てる問題の生成と回答判定
 */

class RefractionQuiz {
  constructor(simulation) {
    this.sim = simulation;
    this.current = null;
    this.tolerance = {
      angle: 1.0,
      index: 0.03,
      hitPixels: 16,
    };
  }

  generate() {
    const candidates = [
      { n1: 1.00, n2: 1.33, label: '空気から水' },
      { n1: 1.00, n2: 1.50, label: '空気からガラス' },
      { n1: 1.33, n2: 1.00, label: '水から空気' },
      { n1: 1.50, n2: 1.00, label: 'ガラスから空気' },
      { n1: 1.00, n2: 2.42, label: '空気からダイヤ' },
    ];

    let problem = null;
    for (let i = 0; i < 30 && !problem; i += 1) {
      const material = candidates[Math.floor(Math.random() * candidates.length)];
      const theta1 = this._rand(18, material.n1 > material.n2 ? 38 : 68);
      const theta2 = this.sim.calcRefraction(theta1, material.n1, material.n2);
      if (theta2 === null) continue;

      const distance = this._rand(118, 176);
      const theta2Rad = this._degToRad(theta2);
      const target = {
        x: this.sim.originX + Math.sin(theta2Rad) * distance,
        y: this.sim.boundaryY + Math.cos(theta2Rad) * distance,
        radius: 15,
      };

      if (
        target.x > 80 &&
        target.x < this.sim.W - 80 &&
        target.y > this.sim.boundaryY + 60 &&
        target.y < this.sim.H - 28
      ) {
        problem = {
          materialLabel: material.label,
          answer: {
            n1: material.n1,
            n2: material.n2,
            theta1: Number(theta1.toFixed(1)),
            theta2: Number(theta2.toFixed(2)),
          },
          target,
        };
      }
    }

    if (!problem) {
      problem = this._fallbackProblem();
    }

    this.current = problem;
    this.sim.setTarget(problem.target);
    return problem;
  }

  evaluate(params) {
    if (!this.current) {
      return { status: 'none', message: '先に問題を生成してください。' };
    }

    const { theta2, isTIR } = this.sim.compute(params.theta1, params.n1, params.n2);
    if (isTIR) {
      return {
        status: 'miss',
        message: '全反射になっています。屈折光が的まで進みません。',
        theta2,
        hitDistance: null,
      };
    }

    const hitDistance = this._distanceFromTargetToRay(theta2, this.current.target);
    const angleOk = Math.abs(params.theta1 - this.current.answer.theta1) <= this.tolerance.angle;
    const n1Ok = Math.abs(params.n1 - this.current.answer.n1) <= this.tolerance.index;
    const n2Ok = Math.abs(params.n2 - this.current.answer.n2) <= this.tolerance.index;
    const hitOk = hitDistance <= this.tolerance.hitPixels;
    const correct = angleOk && n1Ok && n2Ok && hitOk;

    return {
      status: correct ? 'correct' : 'miss',
      message: correct
        ? '正解です。屈折光が的に入りました。'
        : this._missMessage({ angleOk, n1Ok, n2Ok, hitOk, hitDistance }),
      theta2,
      hitDistance,
      checks: { angleOk, n1Ok, n2Ok, hitOk },
    };
  }

  revealAnswer() {
    if (!this.current) return '先に問題を生成してください。';
    const a = this.current.answer;
    return `n₁=${a.n1.toFixed(2)} / n₂=${a.n2.toFixed(2)} / 入射角=${a.theta1.toFixed(1)}° / 屈折角=${a.theta2.toFixed(2)}°`;
  }

  _fallbackProblem() {
    const n1 = 1.00;
    const n2 = 1.50;
    const theta1 = 45;
    const theta2 = this.sim.calcRefraction(theta1, n1, n2);
    const theta2Rad = this._degToRad(theta2);
    const distance = 150;
    return {
      materialLabel: '空気からガラス',
      answer: { n1, n2, theta1, theta2 },
      target: {
        x: this.sim.originX + Math.sin(theta2Rad) * distance,
        y: this.sim.boundaryY + Math.cos(theta2Rad) * distance,
        radius: 15,
      },
    };
  }

  _distanceFromTargetToRay(theta2Deg, target) {
    const theta2Rad = this._degToRad(theta2Deg);
    const dx = Math.sin(theta2Rad);
    const dy = Math.cos(theta2Rad);
    const vx = target.x - this.sim.originX;
    const vy = target.y - this.sim.boundaryY;
    const projection = Math.max(0, vx * dx + vy * dy);
    const closestX = this.sim.originX + dx * projection;
    const closestY = this.sim.boundaryY + dy * projection;
    return Math.hypot(target.x - closestX, target.y - closestY);
  }

  _missMessage(checks) {
    const hints = [];
    if (!checks.n1Ok) hints.push('n₁');
    if (!checks.n2Ok) hints.push('n₂');
    if (!checks.angleOk) hints.push('入射角');
    if (!checks.hitOk) hints.push(`的から ${checks.hitDistance.toFixed(1)} px ずれています`);
    return `不正解です。${hints.join(' / ')} を見直してください。`;
  }

  _rand(min, max) {
    return min + Math.random() * (max - min);
  }

  _degToRad(deg) {
    return deg * Math.PI / 180;
  }
}
