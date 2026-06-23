/**
 * app.js
 * アプリケーションコントローラー
 */

(function () {
  // ── 初期化 ──
  const sim = new RefractionSimulation('simCanvas');
  const logger = new SimulationLogger();
  const quiz = new RefractionQuiz(sim);

  // UI要素
  const angleSlider = document.getElementById('angleSlider');
  const n1Slider    = document.getElementById('n1Slider');
  const n2Slider    = document.getElementById('n2Slider');
  const angleVal    = document.getElementById('angleVal');
  const n1Val       = document.getElementById('n1Val');
  const n2Val       = document.getElementById('n2Val');
  const runBtn      = document.getElementById('runBtn');
  const tirWarning  = document.getElementById('tirWarning');
  const formulaResult = document.getElementById('formulaResult');
  const incidentDisplay  = document.getElementById('incidentDisplay');
  const refractedDisplay = document.getElementById('refractedDisplay');
  const logBody     = document.getElementById('logBody');
  const logCount    = document.getElementById('logCount');
  const clearLogBtn = document.getElementById('clearLog');
  const exportLogBtn = document.getElementById('exportLog');
  const newQuizBtn = document.getElementById('newQuizBtn');
  const checkQuizBtn = document.getElementById('checkQuizBtn');
  const revealQuizBtn = document.getElementById('revealQuizBtn');
  const quizState = document.getElementById('quizState');
  const quizMaterial = document.getElementById('quizMaterial');
  const quizTarget = document.getElementById('quizTarget');
  const quizFeedback = document.getElementById('quizFeedback');

  // ── スライダーイベント ──
  angleSlider.addEventListener('input', () => {
    const v = parseFloat(angleSlider.value);
    angleVal.textContent = `${v.toFixed(1)}°`;
    incidentDisplay.textContent = v.toFixed(1);
    updateFormulaPreview();
    previewDraw();
  });

  n1Slider.addEventListener('input', () => {
    n1Val.textContent = parseFloat(n1Slider.value).toFixed(2);
    updateFormulaPreview();
    previewDraw();
  });

  n2Slider.addEventListener('input', () => {
    n2Val.textContent = parseFloat(n2Slider.value).toFixed(2);
    updateFormulaPreview();
    previewDraw();
  });

  /** スライダー変更時にリアルタイムプレビュー（アニメなし） */
  function previewDraw() {
    const params = getParams();
    sim.draw(params, 1);
    const { theta2, isTIR } = sim.compute(params.theta1, params.n1, params.n2);
    updateBadges(isTIR, theta2);
    tirWarning.classList.toggle('hidden', !isTIR);
  }

  /** 数式プレビュー更新 */
  function updateFormulaPreview() {
    const params = getParams();
    const { theta2, isTIR } = sim.compute(params.theta1, params.n1, params.n2);
    const sin1 = Math.sin(params.theta1 * Math.PI / 180);
    const lhs = (params.n1 * sin1).toFixed(4);
    if (isTIR) {
      formulaResult.textContent = `${params.n1.toFixed(2)} × sin(${params.theta1.toFixed(1)}°) = ${lhs}  →  全反射`;
    } else {
      const sin2 = Math.sin(theta2 * Math.PI / 180);
      formulaResult.textContent =
        `${params.n1.toFixed(2)} × ${sin1.toFixed(4)} = ${params.n2.toFixed(2)} × ${sin2.toFixed(4)}`;
    }
  }

  /** バッジ更新 */
  function updateBadges(isTIR, theta2) {
    refractedDisplay.textContent = isTIR ? '全反射' : theta2.toFixed(2);
  }

  /** 現在のパラメータを取得 */
  function getParams() {
    return {
      theta1: parseFloat(angleSlider.value),
      n1: parseFloat(n1Slider.value),
      n2: parseFloat(n2Slider.value),
    };
  }

  // ── プリセットボタン ──
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const n1 = parseFloat(btn.dataset.n1);
      const n2 = parseFloat(btn.dataset.n2);
      const angle = parseFloat(btn.dataset.angle);

      n1Slider.value = n1;
      n2Slider.value = n2;
      angleSlider.value = angle;
      syncParamLabels();
    });
  });

  // ── 実行ボタン ──
  runBtn.addEventListener('click', () => {
    const params = getParams();
    const { theta2, isTIR } = sim.compute(params.theta1, params.n1, params.n2);

    // アニメーション実行
    sim.run(params);

    // バッジ・警告更新
    updateBadges(isTIR, theta2);
    tirWarning.classList.toggle('hidden', !isTIR);
    updateFormulaPreview();

    // ログ記録
    const entry = logger.add(params, { theta2, isTIR });
    addLogRow(entry);
    logCount.textContent = `${logger.logs.length} 件`;

    // ボタンフラッシュ
    runBtn.style.background = '#33DDFF';
    setTimeout(() => { runBtn.style.background = ''; }, 200);
  });

  /** ログ行をテーブルに追加（先頭挿入） */
  function addLogRow(entry) {
    // 空メッセージ行があれば削除
    const emptyRow = logBody.querySelector('.log-empty');
    if (emptyRow) emptyRow.remove();

    const tr = document.createElement('tr');
    const resultHtml = entry.isTIR
      ? `<span class="result-tir">全反射</span>`
      : `<span class="result-ok">屈折</span>`;
    const theta2Text = entry.isTIR ? '—' : entry.theta2.toFixed(2) + '°';

    tr.innerHTML = `
      <td>${entry.id}</td>
      <td>${logger.formatDateShort(entry.timestamp)}</td>
      <td>${entry.n1.toFixed(2)}</td>
      <td>${entry.n2.toFixed(2)}</td>
      <td>${entry.theta1.toFixed(1)}°</td>
      <td>${theta2Text}</td>
      <td>${resultHtml}</td>
    `;
    logBody.insertBefore(tr, logBody.firstChild);
  }

  /** 起動時に保存済みログを復元 */
  function restoreLogs() {
    if (logger.logs.length === 0) return;
    logBody.innerHTML = '';
    // 最新50件を表示
    logger.logs.slice(0, 50).forEach(entry => addLogRow(entry));
    logCount.textContent = `${logger.logs.length} 件`;
  }

  // ── クリアボタン ──
  clearLogBtn.addEventListener('click', () => {
    if (!confirm('ログを全件削除しますか？')) return;
    logger.clear();
    logBody.innerHTML = `<tr class="log-empty"><td colspan="7">まだログがありません。シミュレーションを実行してください。</td></tr>`;
    logCount.textContent = '0 件';
  });

  // ── CSV エクスポート ──
  exportLogBtn.addEventListener('click', () => {
    if (logger.logs.length === 0) { alert('エクスポートするログがありません。'); return; }
    const csv = logger.toCSV();
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_` +
               `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    a.download = `phygame_log_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── クイズ機能 ──
  newQuizBtn.addEventListener('click', () => {
    const problem = quiz.generate();
    applyQuizFixedParams(problem.fixed);
    quizState.textContent = '出題中';
    quizState.className = 'quiz-state mono is-active';
    quizMaterial.textContent = problem.materialLabel;
    quizTarget.textContent = `x=${problem.target.x.toFixed(0)}, y=${problem.target.y.toFixed(0)}`;
    quizFeedback.textContent = problem.fixed && Object.keys(problem.fixed).length
      ? '固定値を保ったまま、残りの値を調整して的に光を当ててください。'
      : '的が表示されました。n₁、n₂、入射角を調整してから回答判定してください。';
    quizFeedback.className = 'quiz-feedback';
    previewDraw();
  });

  checkQuizBtn.addEventListener('click', () => {
    const params = getParams();
    const result = quiz.evaluate(params);
    sim.run(params);
    quizFeedback.textContent = result.message;
    quizFeedback.className = `quiz-feedback ${result.status === 'correct' ? 'is-correct' : 'is-miss'}`;
    quizState.textContent = result.status === 'correct' ? '正解' : '判定済み';
    quizState.className = `quiz-state mono ${result.status === 'correct' ? 'is-correct' : 'is-miss'}`;
  });

  revealQuizBtn.addEventListener('click', () => {
    quizFeedback.textContent = quiz.revealAnswer();
    quizFeedback.className = 'quiz-feedback is-answer';
    quizState.textContent = '答え表示';
    quizState.className = 'quiz-state mono is-answer';
  });

  function applyQuizFixedParams(fixed) {
    if (!fixed) return;
    if (typeof fixed.theta1 === 'number') angleSlider.value = fixed.theta1;
    if (typeof fixed.n1 === 'number') n1Slider.value = fixed.n1;
    if (typeof fixed.n2 === 'number') n2Slider.value = fixed.n2;
    syncParamLabels();
  }

  function syncParamLabels() {
    const angle = parseFloat(angleSlider.value);
    const n1 = parseFloat(n1Slider.value);
    const n2 = parseFloat(n2Slider.value);
    n1Val.textContent = n1.toFixed(2);
    n2Val.textContent = n2.toFixed(2);
    angleVal.textContent = `${angle.toFixed(1)}°`;
    incidentDisplay.textContent = angle.toFixed(1);
    updateFormulaPreview();
    previewDraw();
  }

  // ── 起動 ──
  updateFormulaPreview();
  previewDraw();
  restoreLogs();
})();
