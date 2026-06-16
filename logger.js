/**
 * logger.js
 * シミュレーション実行ログ管理
 */

class SimulationLogger {
  constructor() {
    this.logs = this._loadFromStorage();
    this.runCount = this.logs.length;
  }

  /** ログエントリを追加 */
  add(params, result) {
    const entry = {
      id: ++this.runCount,
      timestamp: new Date(),
      n1: params.n1,
      n2: params.n2,
      theta1: params.theta1,
      theta2: result.isTIR ? null : result.theta2,
      isTIR: result.isTIR,
    };
    this.logs.unshift(entry); // 最新を先頭に
    this._saveToStorage();
    return entry;
  }

  /** 全ログをクリア */
  clear() {
    this.logs = [];
    this.runCount = 0;
    localStorage.removeItem('phygame_logs');
  }

  /** CSV エクスポート */
  toCSV() {
    const headers = ['#', '実行日時', 'n1', 'n2', '入射角(°)', '屈折角(°)', '結果'];
    const rows = this.logs.map(e => [
      e.id,
      this._formatDate(e.timestamp),
      e.n1.toFixed(2),
      e.n2.toFixed(2),
      e.theta1.toFixed(1),
      e.isTIR ? '—' : e.theta2.toFixed(2),
      e.isTIR ? '全反射' : '屈折'
    ]);
    return [headers, ...rows].map(r => r.join(',')).join('\n');
  }

  /** 日時フォーマット */
  _formatDate(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  /** localStorage に保存（最大100件） */
  _saveToStorage() {
    try {
      const storable = this.logs.slice(0, 100).map(e => ({
        ...e,
        timestamp: e.timestamp.toISOString()
      }));
      localStorage.setItem('phygame_logs', JSON.stringify({ runCount: this.runCount, logs: storable }));
    } catch(e) { /* quota exceeded など無視 */ }
  }

  /** localStorage から復元 */
  _loadFromStorage() {
    try {
      const raw = localStorage.getItem('phygame_logs');
      if (!raw) return [];
      const data = JSON.parse(raw);
      this.runCount = data.runCount || 0;
      return (data.logs || []).map(e => ({ ...e, timestamp: new Date(e.timestamp) }));
    } catch(e) {
      return [];
    }
  }

  /** 日時を短縮表示用にフォーマット */
  formatDateShort(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}
