/**
 * app.js
 * アプリケーションコントローラー (光の屈折 / 水面波 / ログ 3モード対応)
 */

(async function () {
  // ── 初期化 ──
  const sim = new RefractionSimulation('simCanvas');
  const waveSim = new WaveSimulation('simCanvas');
  const logger = new SimulationLogger();
  const quiz = new RefractionQuiz(sim);

  let currentMode = 'refraction'; // 'refraction' | 'wave' | 'log'
  let currentUserName = localStorage.getItem('phyuserName') || '';

  // UI要素 (共通)
  const runBtn      = document.getElementById('runBtn');

  // UI要素 (表示切り替え用コンテナ)
  const simulationView = document.getElementById('simulationView');
  const logView         = document.getElementById('logView');

  // UI要素 (屈折)
  const angleSlider = document.getElementById('angleSlider');
  const n1Slider    = document.getElementById('n1Slider');
  const n2Slider    = document.getElementById('n2Slider');
  const angleVal    = document.getElementById('angleVal');
  const n1Val       = document.getElementById('n1Val');
  const n2Val       = document.getElementById('n2Val');
  const tirWarning  = document.getElementById('tirWarning');
  const formulaResult = document.getElementById('formulaResult');
  const incidentDisplay  = document.getElementById('incidentDisplay');
  const refractedDisplay = document.getElementById('refractedDisplay');

  // UI要素 (クイズ)
  const newQuizBtn = document.getElementById('newQuizBtn');
  const checkQuizBtn = document.getElementById('checkQuizBtn');
  const revealQuizBtn = document.getElementById('revealQuizBtn');
  const quizState = document.getElementById('quizState');
  const quizMaterial = document.getElementById('quizMaterial');
  const quizTarget = document.getElementById('quizTarget');
  const quizFeedback = document.getElementById('quizFeedback');

  // UI要素 (水面波)
  const tabRefraction      = document.getElementById('tabRefraction');
  const tabWave            = document.getElementById('tabWave');
  const tabLog              = document.getElementById('tabLog');
  const refractionControls = document.getElementById('refractionControls');
  const waveControls       = document.getElementById('waveControls');
  const waveAmpSlider      = document.getElementById('waveAmpSlider');
  const waveSpeedSlider    = document.getElementById('waveSpeedSlider');
  const waveFreqSlider     = document.getElementById('waveFreqSlider');
  const waveViscSlider     = document.getElementById('waveViscSlider');
  const waveAmpVal          = document.getElementById('waveAmpVal');
  const waveSpeedVal        = document.getElementById('waveSpeedVal');
  const waveFreqVal         = document.getElementById('waveFreqVal');
  const waveViscVal         = document.getElementById('waveViscVal');
  const toolPenBtn         = document.getElementById('toolPenBtn');
  const toolEraserBtn       = document.getElementById('toolEraserBtn');

  // UI要素 (ログタブ — 屈折系)
  const refractionLogBody  = document.getElementById('refractionLogBody');
  const refractionLogCount = document.getElementById('refractionLogCount');
  const exportRefractionLog = document.getElementById('exportRefractionLog');

  // UI要素 (ログタブ — 水面波系)
  const waveLogBody  = document.getElementById('waveLogBody');
  const waveLogCount = document.getElementById('waveLogCount');
  const exportWaveLog = document.getElementById('exportWaveLog');

  // UI要素 (名前モーダル)
  const nameModal = document.getElementById('nameModal');
  const nameInput = document.getElementById('nameInput');
  const nameSubmitBtn = document.getElementById('nameSubmitBtn');
  const changeNameBtn = document.getElementById('changeNameBtn');

  // モード初期設定
  document.body.classList.add('mode-refraction');

  // ── モード切り替えタブ ──
  tabRefraction.addEventListener('click', () => {
    if (currentMode === 'refraction') return;
    currentMode = 'refraction';
    tabRefraction.classList.add('active');
    tabWave.classList.remove('active');
    tabLog.classList.remove('active');
    document.body.classList.remove('mode-wave');
    document.body.classList.add('mode-refraction');
    refractionControls.classList.remove('hidden');
    waveControls.classList.add('hidden');

    simulationView.classList.remove('hidden');
    logView.classList.add('hidden');

    // 水面波のループを停止し、屈折のプレビューを描画
    waveSim.stop();
    previewDraw();
  });

  tabWave.addEventListener('click', () => {
    if (currentMode === 'wave') return;
    currentMode = 'wave';
    tabWave.classList.add('active');
    tabRefraction.classList.remove('active');
    tabLog.classList.remove('active');
    document.body.classList.remove('mode-refraction');
    document.body.classList.add('mode-wave');
    waveControls.classList.remove('hidden');
    refractionControls.classList.add('hidden');

    simulationView.classList.remove('hidden');
    logView.classList.add('hidden');

    // 屈折シミュレーションの的を非表示にし、水面波パラメータを設定してループ開始
    sim.clearTarget();
    waveSim.setParams(getWaveParams());
    waveSim.run();
  });

  tabLog.addEventListener('click', async () => {
    if (currentMode === 'log') return;
    currentMode = 'log';
    tabLog.classList.add('active');
    tabRefraction.classList.remove('active');
    tabWave.classList.remove('active');

    // シミュレーション表示を隠し、ログ表示に切り替え
    simulationView.classList.add('hidden');
    logView.classList.remove('hidden');

    // 水面波ループは表示されていない間は停止しておく
    waveSim.stop();

    // 最新のログ内容をサーバーから取得して再描画
    await logger.refresh();
    renderRefractionLogs();
    renderWaveLogs();
  });

  // ── スライダーイベント (屈折) ──
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
    if (currentMode !== 'refraction') return;
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

  /** 現在のパラメータを取得 (屈折) */
  function getParams() {
    return {
      theta1: parseFloat(angleSlider.value),
      n1: parseFloat(n1Slider.value),
      n2: parseFloat(n2Slider.value),
    };
  }

  // ── プリセットボタン (屈折) ──
  document.querySelectorAll('.preset-btn:not(.wave-preset-btn)').forEach(btn => {
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

  // ── スライダーイベント (水面波) ──
  function getWaveParams() {
    return {
      amplitude: parseFloat(waveAmpSlider.value),
      speed: parseFloat(waveSpeedSlider.value),
      frequency: parseFloat(waveFreqSlider.value),
      viscosity: parseFloat(waveViscSlider.value),
    };
  }

  function updateWaveParams() {
    const params = getWaveParams();
    waveSim.setParams(params);
  }

  function getViscosityLabel(v) {
    if (v >= 0.995) return '極低 (さらさら)';
    if (v >= 0.990) return '低';
    if (v >= 0.980) return '普通';
    if (v >= 0.965) return '高';
    return '極高 (どろどろ)';
  }

  waveAmpSlider.addEventListener('input', () => {
    waveAmpVal.textContent = parseFloat(waveAmpSlider.value).toFixed(1);
    updateWaveParams();
  });

  waveSpeedSlider.addEventListener('input', () => {
    waveSpeedVal.textContent = parseFloat(waveSpeedSlider.value).toFixed(2);
    updateWaveParams();
  });

  waveFreqSlider.addEventListener('input', () => {
    waveFreqVal.textContent = `${parseFloat(waveFreqSlider.value).toFixed(1)}Hz`;
    updateWaveParams();
  });

  waveViscSlider.addEventListener('input', () => {
    const v = parseFloat(waveViscSlider.value);
    waveViscVal.textContent = getViscosityLabel(v);
    updateWaveParams();
  });

  // 初期粘度ラベルの表示
  waveViscVal.textContent = getViscosityLabel(parseFloat(waveViscSlider.value));

  // ── プリセットボタン (水面波) ──
  document.querySelectorAll('.wave-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      waveSim.setPreset(preset);
    });
  });

  // ── 障害物ペンの切り替え (水面波) ──
  let activeTool = 'pen'; // 'pen' または 'eraser'
  let isDrawing = false;

  toolPenBtn.addEventListener('click', () => {
    activeTool = 'pen';
    toolPenBtn.classList.add('active');
    toolEraserBtn.classList.remove('active');
  });

  toolEraserBtn.addEventListener('click', () => {
    activeTool = 'eraser';
    toolEraserBtn.classList.add('active');
    toolPenBtn.classList.remove('active');
  });

  // キャンバスドラッグ操作 (水面波)
  const canvas = document.getElementById('simCanvas');

  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    if (currentMode !== 'wave') return;
    isDrawing = true;
    const pos = getMousePos(e);
    handleDraw(pos.x, pos.y);
  });

  canvas.addEventListener('mousemove', (e) => {
    if (currentMode !== 'wave' || !isDrawing) return;
    const pos = getMousePos(e);
    handleDraw(pos.x, pos.y);
  });

  window.addEventListener('mouseup', () => {
    isDrawing = false;
  });

  // タッチデバイス対応
  canvas.addEventListener('touchstart', (e) => {
    if (currentMode !== 'wave') return;
    isDrawing = true;
    const touch = e.touches[0];
    const pos = getMousePos(touch);
    handleDraw(pos.x, pos.y);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (currentMode !== 'wave' || !isDrawing) return;
    const touch = e.touches[0];
    const pos = getMousePos(touch);
    handleDraw(pos.x, pos.y);
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    isDrawing = false;
  });

  function handleDraw(cx, cy) {
    if (activeTool === 'pen') {
      waveSim.addObstacle(cx, cy, 3);
    } else {
      waveSim.removeObstacle(cx, cy, 4);
    }
  }

  // ── 実行ボタン ──
  runBtn.addEventListener('click', async () => {
    if (currentMode === 'refraction') {
      const params = getParams();
      const { theta2, isTIR } = sim.compute(params.theta1, params.n1, params.n2);

      // アニメーション実行
      sim.run(params);

      // バッジ・警告更新
      updateBadges(isTIR, theta2);
      tirWarning.classList.toggle('hidden', !isTIR);
      updateFormulaPreview();

      // ログ記録 (屈折系ログへ)
      await logger.add(params, { theta2, isTIR }, currentUserName);
      renderRefractionLogs();
    } else if (currentMode === 'wave') {
      // 水面波モード
      const params = getWaveParams();

      // シミュレーションの状態を一度クリアして再スタートさせる
      waveSim.clear();

      // ログ記録 (タイプ: 'wave', 障害物の有無を含める)
      await logger.add(params, {
        type: 'wave',
        hasObstacles: waveSim.hasObstacles()
      }, currentUserName);
      renderWaveLogs();
    }

    // ボタンフラッシュ
    runBtn.style.background = '#33DDFF';
    setTimeout(() => { runBtn.style.background = ''; }, 200);
  });

  /** ログ1件分のテーブル行を生成 (タイプに応じて表記を切り替え) */
  function buildLogRow(entry) {
    const tr = document.createElement('tr');

    const isQuiz = entry.type === 'quiz';
    const isWave = entry.type === 'wave';

    let typeHtml = `<span class="log-type-normal">通常</span>`;
    if (isQuiz) {
      typeHtml = `<span class="log-type-quiz">クイズ</span>`;
    }

    let resultHtml = '';
    if (isWave) {
      resultHtml = entry.hasObstacles
        ? `<span class="result-ok">障害物あり</span>`
        : `<span class="result-correct" style="color:var(--text-muted);">なし</span>`;
    } else if (isQuiz) {
      if (entry.fixedOk === false) {
        resultHtml = `<span class="result-miss">ルール違反</span>`;
      } else if (entry.quizStatus === 'correct') {
        resultHtml = `<span class="result-correct">正解</span>`;
      } else {
        resultHtml = `<span class="result-miss">不正解</span>`;
      }
      if (entry.isTIR) {
        resultHtml += ` <span class="result-tir">(全反射)</span>`;
      }
    } else {
      resultHtml = entry.isTIR
        ? `<span class="result-tir">全反射</span>`
        : `<span class="result-ok">屈折</span>`;
    }

    let theta1Text = '';
    let theta2Text = '';

    if (isWave) {
      theta1Text = entry.theta1.toFixed(1) + 'Hz';
      theta2Text = entry.theta2 ? entry.theta2.toFixed(3) : '—';
    } else {
      theta1Text = entry.theta1.toFixed(1) + '°';
      theta2Text = entry.isTIR ? '—' : entry.theta2.toFixed(2) + '°';
    }

    tr.innerHTML = `
      <td>${entry.id}</td>
      <td>${logger.formatDateShort(entry.timestamp)}</td>
      <td>${entry.userName || '—'}</td>
      <td>${typeHtml}</td>
      <td>${entry.n1.toFixed(2)}</td>
      <td>${entry.n2.toFixed(2)}</td>
      <td>${theta1Text}</td>
      <td>${theta2Text}</td>
      <td>${resultHtml}</td>
    `;
    return tr;
  }

  /** 屈折系ログ (通常 + クイズ) をテーブルへ再描画 */
  function renderRefractionLogs() {
    const logs = logger.refractionLogs;
    refractionLogBody.innerHTML = '';
    if (logs.length === 0) {
      refractionLogBody.innerHTML = `<tr class="log-empty"><td colspan="8">まだログがありません。光の屈折シミュレーションを実行してください。</td></tr>`;
    } else {
      // 最新50件を表示
      logs.slice(0, 50).forEach(entry => {
        refractionLogBody.appendChild(buildLogRow(entry));
      });
    }
    refractionLogCount.textContent = `${logs.length} 件`;
  }

  /** 水面波ログをテーブルへ再描画 */
  function renderWaveLogs() {
    const logs = logger.waveLogs;
    waveLogBody.innerHTML = '';
    if (logs.length === 0) {
      waveLogBody.innerHTML = `<tr class="log-empty"><td colspan="8">まだログがありません。水面波シミュレーションを実行してください。</td></tr>`;
    } else {
      // 最新50件を表示
      logs.slice(0, 50).forEach(entry => {
        waveLogBody.appendChild(buildLogRow(entry));
      });
    }
    waveLogCount.textContent = `${logs.length} 件`;
  }

  // ── 屈折系ログ: CSV エクスポート ──
  exportRefractionLog.addEventListener('click', () => {
    if (logger.refractionLogs.length === 0) { alert('エクスポートする屈折ログがありません。'); return; }
    downloadCSV(logger.toCSV('refraction'), 'refraction');
  });

  // ── 水面波ログ: CSV エクスポート ──
  exportWaveLog.addEventListener('click', () => {
    if (logger.waveLogs.length === 0) { alert('エクスポートする水面波ログがありません。'); return; }
    downloadCSV(logger.toCSV('wave'), 'wave');
  });

  /** CSV ダウンロード共通処理 */
  function downloadCSV(csv, suffix) {
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_` +
               `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    a.download = `phygame_log_${suffix}_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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

  checkQuizBtn.addEventListener('click', async () => {
    const params = getParams();
    const result = quiz.evaluate(params);
    const { theta2, isTIR } = sim.compute(params.theta1, params.n1, params.n2);

    sim.run(params);
    quizFeedback.textContent = result.message;
    quizFeedback.className = `quiz-feedback ${result.status === 'correct' ? 'is-correct' : 'is-miss'}`;
    quizState.textContent = result.status === 'correct' ? '正解' : '判定済み';
    quizState.className = `quiz-state mono ${result.status === 'correct' ? 'is-correct' : 'is-miss'}`;

    // ログ記録 (屈折系ログへ)
    await logger.add(params, {
      theta2: isTIR ? null : theta2,
      isTIR,
      type: 'quiz',
      quizStatus: result.status,
      fixedOk: result.checks.fixedOk
    }, currentUserName);
    renderRefractionLogs();
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

  // ── 起動と名前入力制御 ──
  function initNameModal() {
    if (!currentUserName) {
      nameModal.classList.remove('hidden');
    }
    
    changeNameBtn.addEventListener('click', () => {
      nameInput.value = currentUserName;
      nameModal.classList.remove('hidden');
      nameInput.focus();
    });

    nameSubmitBtn.addEventListener('click', () => {
      const val = nameInput.value.trim();
      if (val) {
        currentUserName = val;
        localStorage.setItem('phyuserName', val);
        nameModal.classList.add('hidden');
      } else {
        alert('名前を入力してください。');
      }
    });

    // Enterキーでも決定可能に
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        nameSubmitBtn.click();
      }
    });
  }

  initNameModal();
  await logger.ready;
  updateFormulaPreview();
  previewDraw();
  renderRefractionLogs();
  renderWaveLogs();
})();
