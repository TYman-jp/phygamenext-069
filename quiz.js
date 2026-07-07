/**
 * quiz.js
 * 屈折光を的に当てる問題の生成と回答判定
 */

class RefractionQuiz {
  constructor(simulation) {
    this.sim = simulation;
    this.current = null;
    this.tolerance = {
      fixedAngle: 0.5,
      fixedIndex: 0.01,
      hitPixels: 2,
    };
  }

  generate() {
    const candidates = [
      { n1: 1.00, n2: 1.33, label: '空気から水' },
      { n1: 1.00, n2: 1.50, label: '空気からガラス' },
      { n1: 1.33, n2: 1.00, label: '水から空気' },
      { n1: 1.50, n2: 1.00, label: 'ガラスから空気' },
      { n1: 1.00, n2: 2.42, label: '空気からダイヤモンド' },
    ];
    const modes = ['free', 'fixedAngle', 'fixedN1', 'fixedN2', 'fixedMaterial'];

    let problem = null;
    for (let i = 0; i < 40 && !problem; i += 1) {
      const material = candidates[Math.floor(Math.random() * candidates.length)];
      const mode = modes[Math.floor(Math.random() * modes.length)];
      const theta1 = this._rand(18, material.n1 > material.n2 ? 38 : 68);
      const theta2 = this.sim.calcRefraction(theta1, material.n1, material.n2);
      if (theta2 === null) continue;

      const target = this._targetFromTheta2(theta2, this._rand(118, 176));
      if (this._isTargetInCanvas(target)) {
        problem = this._buildProblem(material, mode, theta1, theta2, target);
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

    const fixedCheck = this._checkFixedParams(params);
    if (!fixedCheck.ok) {
      return {
        status: 'miss',
        message: `${fixedCheck.message} 固定値を合わせてから、的を狙ってください。`,
        theta2: null,
        hitDistance: null,
        checks: { fixedOk: false, hitOk: false },
      };
    }

    const { theta2, isTIR } = this.sim.compute(params.theta1, params.n1, params.n2);
    if (isTIR) {
      return {
        status: 'miss',
        message: '全反射になっています。屈折光が的まで進みません。',
        theta2,
        hitDistance: null,
        checks: { fixedOk: true, hitOk: false },
      };
    }

    const hitDistance = this._distanceFromTargetToRay(theta2, this.current.target);
    const hitLimit = (this.current.target.radius || 0) + this.tolerance.hitPixels;
    const hitOk = hitDistance <= hitLimit;

    return {
      status: hitOk ? 'correct' : 'miss',
      message: hitOk
        ? '正解です。屈折光が的に当たっています。'
        : `不正解です。光線は的から ${hitDistance.toFixed(1)} px ずれています。`,
      theta2,
      hitDistance,
      checks: { fixedOk: true, hitOk },
    };
  }

  revealAnswer() {
    if (!this.current) return '先に問題を生成してください。';
    const a = this.current.sampleSolution;
    return `答えの一例: n1=${a.n1.toFixed(2)} / n2=${a.n2.toFixed(2)} / 入射角=${a.theta1.toFixed(1)}° / 屈折角=${a.theta2.toFixed(2)}°`;
  }

  _buildProblem(material, mode, theta1, theta2, target) {
    const sampleSolution = {
      n1: material.n1,
      n2: material.n2,
      theta1: Number(theta1.toFixed(1)),
      theta2: Number(theta2.toFixed(2)),
    };
    const fixed = this._fixedParamsForMode(mode, sampleSolution);
    const conditionText = this._conditionText(mode, material.label, sampleSolution);

    return {
      materialLabel: conditionText,
      mode,
      fixed,
      sampleSolution,
      target,
    };
  }

  _fixedParamsForMode(mode, answer) {
    switch (mode) {
      case 'fixedAngle':
        return { theta1: answer.theta1 };
      case 'fixedN1':
        return { n1: answer.n1 };
      case 'fixedN2':
        return { n2: answer.n2 };
      case 'fixedMaterial':
        return { n1: answer.n1, n2: answer.n2 };
      default:
        return {};
    }
  }

  _conditionText(mode, materialLabel, answer) {
    switch (mode) {
      case 'fixedAngle':
        return `${materialLabel} / 入射角 ${answer.theta1.toFixed(1)}° 固定`;
      case 'fixedN1':
        return `媒質1 n1=${answer.n1.toFixed(2)} 固定`;
      case 'fixedN2':
        return `媒質2 n2=${answer.n2.toFixed(2)} 固定`;
      case 'fixedMaterial':
        return `${materialLabel} 固定`;
      default:
        return `${materialLabel} / 自由調整`;
    }
  }

  _checkFixedParams(params) {
    if (!this.current) return { ok: false, message: '問題がありません。' };

    const fixed = this.current.fixed || {};
    const misses = [];
    if (
      typeof fixed.theta1 === 'number' &&
      Math.abs(params.theta1 - fixed.theta1) > this.tolerance.fixedAngle
    ) {
      misses.push(`入射角 ${fixed.theta1.toFixed(1)}°`);
    }
    if (
      typeof fixed.n1 === 'number' &&
      Math.abs(params.n1 - fixed.n1) > this.tolerance.fixedIndex
    ) {
      misses.push(`n1=${fixed.n1.toFixed(2)}`);
    }
    if (
      typeof fixed.n2 === 'number' &&
      Math.abs(params.n2 - fixed.n2) > this.tolerance.fixedIndex
    ) {
      misses.push(`n2=${fixed.n2.toFixed(2)}`);
    }

    return {
      ok: misses.length === 0,
      message: misses.length ? `この問題は ${misses.join(' / ')} が固定です。` : '',
    };
  }

  _fallbackProblem() {
    const material = { n1: 1.00, n2: 1.50, label: '空気からガラス' };
    const theta1 = 45;
    const theta2 = this.sim.calcRefraction(theta1, material.n1, material.n2);
    const target = this._targetFromTheta2(theta2, 150);
    return this._buildProblem(material, 'fixedMaterial', theta1, theta2, target);
  }

  _targetFromTheta2(theta2, distance) {
    const theta2Rad = this._degToRad(theta2);
    return {
      x: this.sim.originX + Math.sin(theta2Rad) * distance,
      y: this.sim.boundaryY + Math.cos(theta2Rad) * distance,
      radius: 15,
    };
  }

  _isTargetInCanvas(target) {
    return (
      target.x > 80 &&
      target.x < this.sim.W - 80 &&
      target.y > this.sim.boundaryY + 60 &&
      target.y < this.sim.H - 28
    );
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

  _rand(min, max) {
    return min + Math.random() * (max - min);
  }

  _degToRad(deg) {
    return deg * Math.PI / 180;
  }
}
