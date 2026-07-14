/**
 * logger.js
 * シミュレーション実行ログ管理 (Firebase Firestore 版)
 *
 * ログは Firebase Firestore に JSON 形式で保存される。
 *   - コレクション `refractionLogs` : type が 'normal' / 'quiz' のログ
 *   - コレクション `waveLogs`       : type が 'wave' のログ
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, writeBatch } from "firebase/firestore";

// ==========================================
// 【Firebase 設定】
// Firebaseコンソールでプロジェクトを作成し、Webアプリを追加して
// 表示された設定値をここに貼り付けてください。
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyBBvqZcJUQ3jndAdTA-4MVXSZhz2U8iCts",
  authDomain: "phygamenext.firebaseapp.com",
  projectId: "phygamenext",
  storageBucket: "phygamenext.firebasestorage.app",
  messagingSenderId: "998076125958",
  appId: "1:998076125958:web:7a020ae6e6387c51f94487",
  measurementId: "G-2F1DVQ09M8"
};

// ダミー設定かどうかの判定
const isDummyConfig = firebaseConfig.apiKey === "YOUR_API_KEY";

// Firebase 初期化
let db = null;
if (!isDummyConfig) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebaseの初期化に失敗しました:", e);
  }
}

class SimulationLogger {
  constructor() {
    this.refractionLogs = [];
    this.waveLogs = [];
    this.runCount = 0; // 今回のセッションでの実行回数ベース（ID用）
    
    // アプリ起動時にFirestoreから最新のログを取得
    this.ready = this.refresh();
  }

  // ── サーバー(Firestore)からログをロード ──
  async refresh() {
    if (!db) {
      console.warn("Firebaseが設定されていないため、ログ機能はオフラインモードで動作します。");
      return;
    }
    try {
      // refractionLogs
      const rRef = collection(db, "refractionLogs");
      const rSnap = await getDocs(query(rRef, orderBy("timestamp", "desc"), limit(100)));
      this.refractionLogs = rSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), timestamp: doc.data().timestamp.toDate() }));

      // waveLogs
      const wRef = collection(db, "waveLogs");
      const wSnap = await getDocs(query(wRef, orderBy("timestamp", "desc"), limit(100)));
      this.waveLogs = wSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), timestamp: doc.data().timestamp.toDate() }));
      
      this._updateRunCount();
    } catch (e) {
      console.error('ログのロードに失敗:', e);
    }
  }

  _updateRunCount() {
    let maxId = 0;
    const all = [...this.refractionLogs, ...this.waveLogs];
    all.forEach(log => {
      if (typeof log.localId === 'number' && log.localId > maxId) maxId = log.localId;
    });
    this.runCount = maxId;
  }

  // ── カテゴリ判定 ──
  _categoryFor(type) { return (type === 'wave' || type === 'wave-quiz') ? 'wave' : 'refraction'; }
  _logsFor(cat) { return cat === 'wave' ? this.waveLogs : this.refractionLogs; }

  // ── ログ追加 (非同期) ──
  async add(params, result, userName = '') {
    const type = result.type || 'normal';
    const cat  = this._categoryFor(type);
    
    this.runCount++;
    const now = new Date();

    const entry = {
      localId: this.runCount,
      timestamp: now,
      userName: userName,
      n1:    params.n1    !== undefined ? params.n1    : (params.amplitude || 0),
      n2:    params.n2    !== undefined ? params.n2    : (params.speed     || 0),
      theta1: params.theta1 !== undefined ? params.theta1 : (params.frequency || 0),
      theta2: result.isTIR ? null : (result.theta2 !== undefined ? result.theta2 : (params.viscosity || null)),
      isTIR: result.isTIR || false,
      type,
      quizStatus:   result.quizStatus || null,
      fixedOk:      result.fixedOk !== undefined ? result.fixedOk : true,
      hasObstacles: result.hasObstacles || false,
      errorDeg:     result.errorDeg !== undefined ? result.errorDeg : null,
    };

    if (db) {
      try {
        const colName = cat === 'wave' ? "waveLogs" : "refractionLogs";
        const docRef = await addDoc(collection(db, colName), entry);
        const finalEntry = { id: docRef.id, ...entry };
        
        // ローカル配列の先頭に追加
        if (cat === 'wave') {
          this.waveLogs.unshift(finalEntry);
          if (this.waveLogs.length > 100) this.waveLogs = this.waveLogs.slice(0, 100);
        } else {
          this.refractionLogs.unshift(finalEntry);
          if (this.refractionLogs.length > 100) this.refractionLogs = this.refractionLogs.slice(0, 100);
        }
        return finalEntry;
      } catch (e) {
        console.error('ログの追加に失敗:', e);
      }
    } else {
      // ダミー時のローカル挙動
      entry.id = 'dummy_' + this.runCount;
      if (cat === 'wave') this.waveLogs.unshift(entry); else this.refractionLogs.unshift(entry);
      return entry;
    }
    return null;
  }

  // ── ログクリア (非同期) ──
  async clear(category) {
    if (!db) {
      if (!category) { this.refractionLogs = []; this.waveLogs = []; }
      else if (category === 'wave') this.waveLogs = []; 
      else this.refractionLogs = [];
      return;
    }

    try {
      const batch = writeBatch(db);
      
      const deleteCollection = async (colName) => {
        const snap = await getDocs(collection(db, colName));
        snap.docs.forEach(doc => { batch.delete(doc.ref); });
      };

      if (!category) {
        await deleteCollection("refractionLogs");
        await deleteCollection("waveLogs");
        await batch.commit();
        this.refractionLogs = [];
        this.waveLogs = [];
        this.runCount = 0;
      } else {
        const colName = category === 'wave' ? "waveLogs" : "refractionLogs";
        await deleteCollection(colName);
        await batch.commit();
        if (category === 'wave') this.waveLogs = []; else this.refractionLogs = [];
      }
    } catch (e) {
      console.error('ログのクリアに失敗:', e);
    }
  }

  // ── CSV 出力 ──
  toCSV(category) {
    const headers = ['#','実行日時','名前','タイプ','n1/振幅','n2/速さ','入射角/周波数','屈折角/粘度','結果'];
    const src = category
      ? this._logsFor(category)
      : [...this.refractionLogs, ...this.waveLogs].sort((a, b) => b.localId - a.localId);

    const rows = src.map(e => {
      let tp = '通常';
      if (e.type === 'quiz') tp = 'クイズ';
      // 水面波も「通常」とするため 'wave' の判定は除外

      let rs = '';
      if (e.type === 'wave') {
        rs = e.hasObstacles ? '障害物あり' : '障害物なし';
      } else if (e.type === 'quiz') {
        rs = e.fixedOk === false ? 'ルール違反' : (e.quizStatus === 'correct' ? '正解' : '不正解');
        if (e.isTIR) rs += '(全反射)';
      } else {
        rs = e.isTIR ? '全反射' : '屈折';
      }

      const t2 = e.type === 'wave'
        ? (e.theta2 ? e.theta2.toFixed(3) : '—')
        : (e.isTIR  ? '—' : (e.theta2 ? e.theta2.toFixed(2) : '0.00'));
      const t1 = e.type === 'wave' ? e.theta1.toFixed(1)+'Hz' : e.theta1.toFixed(1)+'°';

      return [e.localId || e.id, this._formatDate(e.timestamp), e.userName || '', tp, e.n1.toFixed(2), e.n2.toFixed(2), t1, t2, rs];
    });
    return [headers, ...rows].map(r => r.join(',')).join('\n');
  }

  _formatDate(d) {
    if (!d) return '';
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  formatDateShort(d) {
    if (!d) return '';
    const p = n => String(n).padStart(2,'0');
    return `${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
}

// 他のスクリプト（app.jsなど）から参照できるようにグローバルへ公開
window.SimulationLogger = SimulationLogger;
