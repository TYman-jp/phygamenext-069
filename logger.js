/**
 * logger.js
 * シミュレーション実行ログ管理
 *
 * ログはサーバー側の data/logs.json に保存する。
 * これにより、同じサーバーへ別アカウントや別ブラウザから接続しても
 * 共通のログを参照できる。
 */

class SimulationLogger {
  constructor() {
    this.storageKeys = {
      refraction: 'phygame_logs_refraction',
      wave: 'phygame_logs_wave',
      legacy: 'phygame_logs',
      migrated: 'phygame_logs_server_migrated',
    };

    this.refractionLogs = [];
    this.waveLogs = [];
    this.runCount = 0;
    this.serverAvailable = true;
    this.ready = this.refresh().then(() => this._migrateLocalLogsToServer());
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

  /** サーバーからログを再取得 */
  async refresh() {
    try {
      const res = await fetch('/api/logs', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this._applyServerData(data);
      this.serverAvailable = true;
    } catch (e) {
      this.serverAvailable = false;
      this._loadFallbackFromStorage();
    }
  }

  /** ログエントリを追加し、種別に応じたカテゴリへ保存 */
  async add(params, result) {
    const type = result.type || 'normal';
    const entry = {
      timestamp: new Date().toISOString(),
      n1: params.n1 !== undefined ? params.n1 : (params.amplitude || 0),
      n2: params.n2 !== undefined ? params.n2 : (params.speed || 0),
      theta1: params.theta1 !== undefined ? params.theta1 : (params.frequency || 0),
      theta2: result.isTIR ? null : (result.theta2 !== undefined ? result.theta2 : (params.viscosity || null)),
      isTIR: result.isTIR || false,
      type,
      quizStatus: result.quizStatus || null,
      fixedOk: result.fixedOk !== undefined ? result.fixedOk : true,
      hasObstacles: result.hasObstacles || false,
    };

    if (!this.serverAvailable) {
      return this._addLocalFallback(entry);
    }

    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this._applyServerData(data);
      return this._normalizeEntry(data.entry);
    } catch (e) {
      this.serverAvailable = false;
      return this._addLocalFallback(entry);
    }
  }

  /**
   * ログをクリアする。
   * category を指定しない場合は両カテゴリとも全クリアする。
   * category に 'refraction' または 'wave' を指定すると、そのカテゴリのみクリアする。
   */
  async clear(category) {
    if (!this.serverAvailable) {
      this._clearLocalFallback(category);
      return;
    }

    try {
      const query = category ? `?category=${encodeURIComponent(category)}` : '';
      const res = await fetch(`/api/logs${query}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this._applyServerData(data);
    } catch (e) {
      this.serverAvailable = false;
      this._clearLocalFallback(category);
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

  /** 日時を短縮表示用にフォーマット */
  formatDateShort(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  _applyServerData(data) {
    this.runCount = data.runCount || 0;
    this.refractionLogs = (data.refractionLogs || []).map(e => this._normalizeEntry(e));
    this.waveLogs = (data.waveLogs || []).map(e => this._normalizeEntry(e));
  }

  _normalizeEntry(entry) {
    return {
      id: Number(entry.id || 0),
      timestamp: entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp),
      n1: Number(entry.n1 || 0),
      n2: Number(entry.n2 || 0),
      theta1: Number(entry.theta1 || 0),
      theta2: entry.theta2 === null || entry.theta2 === undefined ? null : Number(entry.theta2),
      isTIR: Boolean(entry.isTIR),
      type: entry.type || 'normal',
      quizStatus: entry.quizStatus || null,
      fixedOk: entry.fixedOk !== undefined ? Boolean(entry.fixedOk) : true,
      hasObstacles: Boolean(entry.hasObstacles),
    };
  }

  async _migrateLocalLogsToServer() {
    if (!this.serverAvailable || localStorage.getItem(this.storageKeys.migrated)) return;

    const localLogs = [
      ...this._readLocalStorageLogs(this.storageKeys.refraction),
      ...this._readLocalStorageLogs(this.storageKeys.wave),
      ...this._readLocalStorageLogs(this.storageKeys.legacy),
    ];
    if (localLogs.length === 0) {
      localStorage.setItem(this.storageKeys.migrated, '1');
      return;
    }

    try {
      const res = await fetch('/api/logs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: localLogs }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this._applyServerData(data);
      localStorage.removeItem(this.storageKeys.refraction);
      localStorage.removeItem(this.storageKeys.wave);
      localStorage.removeItem(this.storageKeys.legacy);
      localStorage.setItem(this.storageKeys.migrated, '1');
    } catch (e) {
      this.serverAvailable = false;
      this._loadFallbackFromStorage();
    }
  }

  _readLocalStorageLogs(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return (data.logs || []).map(e => this._normalizeEntry(e));
    } catch (e) {
      return [];
    }
  }

  _loadFallbackFromStorage() {
    const refractionData = this._loadCategoryFallback(this.storageKeys.refraction);
    const waveData = this._loadCategoryFallback(this.storageKeys.wave);
    this.refractionLogs = refractionData.logs;
    this.waveLogs = waveData.logs;
    this.runCount = Math.max(refractionData.runCount, waveData.runCount);
  }

  _loadCategoryFallback(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { runCount: 0, logs: [] };
      const data = JSON.parse(raw);
      return {
        runCount: data.runCount || 0,
        logs: (data.logs || []).map(e => this._normalizeEntry(e)),
      };
    } catch (e) {
      return { runCount: 0, logs: [] };
    }
  }

  _addLocalFallback(entry) {
    const category = this._categoryFor(entry.type);
    const savedEntry = this._normalizeEntry({
      ...entry,
      id: ++this.runCount,
      timestamp: entry.timestamp || new Date().toISOString(),
    });
    this._logsFor(category).unshift(savedEntry);
    this._saveFallback(category);
    return savedEntry;
  }

  _clearLocalFallback(category) {
    if (!category) {
      this.refractionLogs = [];
      this.waveLogs = [];
      this.runCount = 0;
      localStorage.removeItem(this.storageKeys.refraction);
      localStorage.removeItem(this.storageKeys.wave);
      localStorage.removeItem(this.storageKeys.legacy);
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

  _saveFallback(category) {
    try {
      const logs = this._logsFor(category);
      const key = category === 'wave' ? this.storageKeys.wave : this.storageKeys.refraction;
      const storable = logs.slice(0, 100).map(e => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      }));
      localStorage.setItem(key, JSON.stringify({ runCount: this.runCount, logs: storable }));
    } catch (e) {
      // localStorage が使えない場合は画面上のログだけ維持する
    }
  }
}
