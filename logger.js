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
      n1: params.n1 !== undefined ? params.n1 : (params.amplitude || 0),
      n2: params.n2 !== undefined ? params.n2 : (params.speed || 0),
      theta1: params.theta1 !== undefined ? params.theta1 : (params.frequency || 0),
      theta2: result.isTIR ? null : (result.theta2 !== undefined ? result.theta2 : (params.viscosity || null)),
      isTIR: result.isTIR || false,
      type: result.type || 'normal', // 'normal', 'quiz', または 'wave'
      quizStatus: result.quizStatus || null,
      fixedOk: result.fixedOk !== undefined ? result.fixedOk : true,
      hasObstacles: result.hasObstacles || false
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
    const headers = ['#', '実行日時', 'タイプ', 'n1/振幅', 'n2/速さ', '入射角/周波数', '屈折角/粘度', '結果'];
    const rows = this.logs.map(e => {
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
