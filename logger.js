/**
 * logger.js
 * シミュレーション実行ログ管理 (サーバー保存・非同期通信対応版)
 *
 * 「光の屈折」系(通常・クイズ)と「水面波」系のログは、
 * サーバー側で別々のJSONファイルとして保存する。
 *   - /api/logs/refraction : type が 'normal' / 'quiz' のログ
 *   - /api/logs/wave       : type が 'wave' のログ
 */

class SimulationLogger {
  constructor() {
    this.refractionLogs = [];
    this.waveLogs = [];
    this.runCount = 0;
  }

  /** サーバーからログデータをロード */
  async load() {
    try {
      const resRef = await fetch('/api/logs/refraction');
      const dataRef = await resRef.json();
      this.refractionLogs = (dataRef.logs || []).map(e => ({ ...e, timestamp: new Date(e.timestamp) }));

      const resWave = await fetch('/api/logs/wave');
      const dataWave = await resWave.json();
      this.waveLogs = (dataWave.logs || []).map(e => ({ ...e, timestamp: new Date(e.timestamp) }));

      // 通し番号(#)はカテゴリ間で共有し、最大値を設定
      this.runCount = Math.max(dataRef.runCount || 0, dataWave.runCount || 0);

      // 旧 localStorage データの移行処理を実行
      await this._migrateLegacyLogs();
    } catch (e) {
      console.error('ログの初期ロードに失敗しました:', e);
    }
  }

  /** type ('normal' | 'quiz' | 'wave') からカテゴリキーを判定 */
  _categoryFor(type) {
    return type === 'wave' ? 'wave' : 'refraction';
  }

  /** 指定カテゴリのログ配列を取得 ('refraction' | 'wave') */
  _logsFor(category) {
    return category === 'wave' ? this.waveLogs : this.refractionLogs;
  }

  /** 現在保存されている全ログ件数 (屈折系 + 水面波系) */
  get totalCount() {
    return this.refractionLogs.length + this.waveLogs.length;
  }

  /** 後方互換のため、屈折系ログを `logs` としても参照可能にする */
  get logs() {
    return this.refractionLogs;
  }

  /** ログエントリを非同期で追加し、サーバーへ保存 */
  async add(params, result) {
    const type = result.type || 'normal'; // 'normal', 'quiz', または 'wave'
    const category = this._categoryFor(type);

    const entry = {
      n1: params.n1 !== undefined ? params.n1 : (params.amplitude || 0),
      n2: params.n2 !== undefined ? params.n2 : (params.speed || 0),
      theta1: params.theta1 !== undefined ? params.theta1 : (params.frequency || 0),
      theta2: result.isTIR ? null : (result.theta2 !== undefined ? result.theta2 : (params.viscosity || null)),
      isTIR: result.isTIR || false,
      type,
      quizStatus: result.quizStatus || null,
      fixedOk: result.fixedOk !== undefined ? result.fixedOk : true,
      hasObstacles: result.hasObstacles || false
    };

    try {
      const res = await fetch(`/api/logs/${category}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      const data = await res.json();
      if (data.success) {
        // ローカル配列をサーバーの最新状態に同期
        const loadedRes = await fetch(`/api/logs/${category}`);
        const loadedData = await loadedRes.json();
        if (category === 'wave') {
          this.waveLogs = (loadedData.logs || []).map(e => ({ ...e, timestamp: new Date(e.timestamp) }));
        } else {
          this.refractionLogs = (loadedData.logs || []).map(e => ({ ...e, timestamp: new Date(e.timestamp) }));
        }
        this.runCount = data.runCount;
        return data.entry;
      }
    } catch (e) {
      console.error('ログの追加に失敗しました:', e);
    }
    return null;
  }

  /** ログをクリアする */
  async clear(category) {
    if (!category) {
      try {
        await fetch('/api/logs/refraction', { method: 'DELETE' });
        await fetch('/api/logs/wave', { method: 'DELETE' });
        this.refractionLogs = [];
        this.waveLogs = [];
        this.runCount = 0;
      } catch (e) {
        console.error('全ログのクリアに失敗しました:', e);
      }
      return;
    }

    try {
      const res = await fetch(`/api/logs/${category}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        if (category === 'wave') {
          this.waveLogs = [];
        } else {
          this.refractionLogs = [];
        }
      }
    } catch (e) {
      console.error(`${category} ログのクリアに失敗しました:`, e);
    }
  }

  /** CSV エクスポート用テキストの生成 */
  toCSV(category) {
    const headers = ['#', '実行日時', 'タイプ', 'n1/振幅', 'n2/速さ', '入射角/周波数', '屈折角/粘度', '結果'];

    const sourceLogs = category
      ? this._logsFor(category)
      : [...this.refractionLogs, ...this.waveLogs].sort((a, b) => b.id - a.id);

    const rows = sourceLogs.map(e => {
      let typeText = '通常';
      if (e.type === 'quiz') typeText = 'クイズ';
      if (e.type === 'wave') typeText = '水面波';

      let resultText = '';
      if (e.type === 'wave') {
        resultText = e.hasObstacles ? '障害物あり' : '障害物なし';
      } else if (e.type === 'quiz') {
        if (e.fixedOk === false) {
          resultText = 'ルール違反';
        } else {
          resultText = e.quizStatus === 'correct' ? '正解' : '不正解';
        }
        if (e.isTIR) {
          resultText += '(全反射)';
        }
      } else {
        resultText = e.isTIR ? '全反射' : '屈折';
      }

      const theta2Val = (e.type === 'wave')
        ? (e.theta2 ? e.theta2.toFixed(3) : '—')
        : (e.isTIR ? '—' : (e.theta2 ? e.theta2.toFixed(2) : '0.00'));

      const theta1Val = (e.type === 'wave')
        ? e.theta1.toFixed(1) + 'Hz'
        : e.theta1.toFixed(1) + '°';

      return [
        e.id,
        this._formatDate(e.timestamp),
        typeText,
        e.n1.toFixed(2),
        e.n2.toFixed(2),
        theta1Val,
        theta2Val,
        resultText
      ];
    });
    return [headers, ...rows].map(r => r.join(',')).join('\n');
  }

  /** 日時フォーマット */
  _formatDate(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  /**
   * 旧 localStorage データを一度だけサーバーへ一括アップロードして移行する。
   */
  async _migrateLegacyLogs() {
    try {
      // 1. 旧一体型キーの移行
      const rawLegacy = localStorage.getItem('phygame_logs');
      if (rawLegacy) {
        const data = JSON.parse(rawLegacy);
        const legacyLogs = (data.logs || []).map(e => ({ ...e, timestamp: new Date(e.timestamp) }));

        const refractionList = [];
        const waveList = [];
        legacyLogs.forEach(entry => {
          if (entry.type === 'wave') {
            waveList.push(entry);
          } else {
            refractionList.push(entry);
          }
        });

        if (refractionList.length > 0) {
          await fetch('/api/logs/refraction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ migrate: true, logs: refractionList, runCount: data.runCount })
          });
        }
        if (waveList.length > 0) {
          await fetch('/api/logs/wave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ migrate: true, logs: waveList, runCount: data.runCount })
          });
        }
        localStorage.removeItem('phygame_logs');
      }

      // 2. 前バージョン分離型ローカルストレージキーの移行
      const rawRef = localStorage.getItem('phygame_logs_refraction');
      if (rawRef) {
        const data = JSON.parse(rawRef);
        if (data.logs && data.logs.length > 0) {
          await fetch('/api/logs/refraction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ migrate: true, logs: data.logs, runCount: data.runCount })
          });
        }
        localStorage.removeItem('phygame_logs_refraction');
      }

      const rawWave = localStorage.getItem('phygame_logs_wave');
      if (rawWave) {
        const data = JSON.parse(rawWave);
        if (data.logs && data.logs.length > 0) {
          await fetch('/api/logs/wave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ migrate: true, logs: data.logs, runCount: data.runCount })
          });
        }
        localStorage.removeItem('phygame_logs_wave');
      }

      // 移行が行われた場合はサーバーから再取得
      if (rawLegacy || rawRef || rawWave) {
        const resRef = await fetch('/api/logs/refraction');
        const dataRef = await resRef.json();
        this.refractionLogs = (dataRef.logs || []).map(e => ({ ...e, timestamp: new Date(e.timestamp) }));

        const resWave = await fetch('/api/logs/wave');
        const dataWave = await resWave.json();
        this.waveLogs = (dataWave.logs || []).map(e => ({ ...e, timestamp: new Date(e.timestamp) }));

        this.runCount = Math.max(dataRef.runCount || 0, dataWave.runCount || 0);
      }
    } catch (e) {
      console.error('マイグレーション処理中にエラーが発生しました:', e);
    }
  }

  /** 日時を短縮表示用にフォーマット */
  formatDateShort(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}

