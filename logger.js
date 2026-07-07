/**
 * logger.js
 * シミュレーション実行ログ管理
 *
 * 「光の屈折」系(通常・クイズ)と「水面波」系のログは見やすさのため
 * localStorage 上で別々のキーに分離して保存する。
 *   - phygame_logs_refraction : type が 'normal' / 'quiz' のログ
 *   - phygame_logs_wave       : type が 'wave' のログ
 */

class SimulationLogger {
  constructor() {
    this.storageKeys = {
      refraction: 'phygame_logs_refraction',
      wave: 'phygame_logs_wave',
    };

    const refractionData = this._loadFromStorage(this.storageKeys.refraction);
    const waveData = this._loadFromStorage(this.storageKeys.wave);

    this.refractionLogs = refractionData.logs;
    this.waveLogs = waveData.logs;

    // 通し番号(#)はカテゴリ間で共有し、これまで通り増分させる
    this.runCount = Math.max(refractionData.runCount, waveData.runCount);

    // 後方互換: 旧キー `phygame_logs` (屈折/クイズ/水面波が混在)が残っている場合は
    // 一度だけ種別ごとに振り分けて移行する。
    this._migrateLegacyLogs();
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

  /** ログエントリを追加し、種別に応じたカテゴリへ保存 */
  add(params, result) {
    const type = result.type || 'normal'; // 'normal', 'quiz', または 'wave'
    const category = this._categoryFor(type);

    const entry = {
      id: ++this.runCount,
      timestamp: new Date(),
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

    this._logsFor(category).unshift(entry); // 最新を先頭に
    this._saveToStorage(category);
    return entry;
  }

  /**
   * ログをクリアする。
   * category を指定しない場合は両カテゴリとも全クリアする。
   * category に 'refraction' または 'wave' を指定すると、そのカテゴリのみクリアする。
   */
  clear(category) {
    if (!category) {
      this.refractionLogs = [];
      this.waveLogs = [];
      this.runCount = 0;
      localStorage.removeItem(this.storageKeys.refraction);
      localStorage.removeItem(this.storageKeys.wave);
      localStorage.removeItem('phygame_logs'); // 旧キーも掃除
      return;
    }
    if (category === 'wave') {
      this.waveLogs = [];
      localStorage.removeItem(this.storageKeys.wave);
    } else {
      this.refractionLogs = [];
      localStorage.removeItem(this.storageKeys.refraction);
    }
  }

  /**
   * CSV エクスポート。
   * category を指定すると ('refraction' | 'wave')、そのカテゴリのログのみを出力する。
   * 指定しない場合は屈折系・水面波系を結合して出力する(後方互換)。
   */
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

  /** localStorage に保存（カテゴリごとに最大100件） */
  _saveToStorage(category) {
    try {
      const logs = this._logsFor(category);
      const key = category === 'wave' ? this.storageKeys.wave : this.storageKeys.refraction;
      const storable = logs.slice(0, 100).map(e => ({
        ...e,
        timestamp: e.timestamp.toISOString()
      }));
      localStorage.setItem(key, JSON.stringify({ runCount: this.runCount, logs: storable }));
    } catch(e) { /* quota exceeded など無視 */ }
  }

  /** localStorage から指定キーのログを復元 */
  _loadFromStorage(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { runCount: 0, logs: [] };
      const data = JSON.parse(raw);
      return {
        runCount: data.runCount || 0,
        logs: (data.logs || []).map(e => ({ ...e, timestamp: new Date(e.timestamp) }))
      };
    } catch(e) {
      return { runCount: 0, logs: [] };
    }
  }

  /**
   * 旧キー `phygame_logs` (種別混在)が存在する場合、
   * 一度だけ種別ごとの新キーへ振り分けて移行する。
   */
  _migrateLegacyLogs() {
    try {
      const raw = localStorage.getItem('phygame_logs');
      if (!raw) return;
      const data = JSON.parse(raw);
      const legacyLogs = (data.logs || []).map(e => ({ ...e, timestamp: new Date(e.timestamp) }));

      legacyLogs.forEach(entry => {
        const category = this._categoryFor(entry.type);
        const target = this._logsFor(category);
        // 既に移行済みの同一IDが無ければ追加
        if (!target.some(existing => existing.id === entry.id)) {
          target.push(entry);
        }
      });

      this.refractionLogs.sort((a, b) => b.id - a.id);
      this.waveLogs.sort((a, b) => b.id - a.id);
      this.runCount = Math.max(this.runCount, data.runCount || 0);

      this._saveToStorage('refraction');
      this._saveToStorage('wave');
      localStorage.removeItem('phygame_logs');
    } catch(e) { /* 移行に失敗しても致命的ではないため無視 */ }
  }

  /** 日時を短縮表示用にフォーマット */
  formatDateShort(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}
