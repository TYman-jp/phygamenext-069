/**
 * server.js
 * PhyGame Next — Node.js 静的ファイルサーバー
 * 使用方法: node server.js [ポート番号(デフォルト:3000)]
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.argv[2] ? parseInt(process.argv[2]) : 3000;
const DATA_DIR = path.join(__dirname, 'data');
const LOG_FILE = path.join(DATA_DIR, 'logs.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

const server = http.createServer((req, res) => {
  // URLパスを正規化
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let urlPath = requestUrl.pathname;

  if (urlPath === '/api/logs' || urlPath === '/api/logs/import') {
    handleLogApi(req, res, requestUrl);
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(__dirname, urlPath);

  // ディレクトリトラバーサル防止
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
      return;
    }

    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });

  // アクセスログ
  const now = new Date().toISOString();
  console.log(`[${now}] ${req.method} ${req.url}`);
});

function handleLogApi(req, res, requestUrl) {
  if (requestUrl.pathname === '/api/logs' && req.method === 'GET') {
    sendJson(res, 200, readLogStore());
    return;
  }

  if (requestUrl.pathname === '/api/logs' && req.method === 'POST') {
    readJsonBody(req, res, body => {
      const store = readLogStore();
      const entry = createLogEntry(body.entry || {});
      const category = categoryFor(entry.type);
      store.runCount += 1;
      entry.id = store.runCount;
      store[category === 'wave' ? 'waveLogs' : 'refractionLogs'].unshift(entry);
      trimStore(store);
      writeLogStore(store);
      sendJson(res, 201, { ...store, entry });
    });
    return;
  }

  if (requestUrl.pathname === '/api/logs' && req.method === 'DELETE') {
    const category = requestUrl.searchParams.get('category');
    const store = readLogStore();
    if (category === 'wave') {
      store.waveLogs = [];
    } else if (category === 'refraction') {
      store.refractionLogs = [];
    } else {
      store.refractionLogs = [];
      store.waveLogs = [];
      store.runCount = 0;
    }
    writeLogStore(store);
    sendJson(res, 200, store);
    return;
  }

  if (requestUrl.pathname === '/api/logs/import' && req.method === 'POST') {
    readJsonBody(req, res, body => {
      const store = readLogStore();
      const logs = Array.isArray(body.logs) ? body.logs : [];
      logs.forEach(raw => {
        const entry = createLogEntry(raw);
        const category = categoryFor(entry.type);
        store.runCount += 1;
        entry.id = store.runCount;
        store[category === 'wave' ? 'waveLogs' : 'refractionLogs'].push(entry);
      });
      store.refractionLogs.sort((a, b) => b.id - a.id);
      store.waveLogs.sort((a, b) => b.id - a.id);
      trimStore(store);
      writeLogStore(store);
      sendJson(res, 200, store);
    });
    return;
  }

  sendJson(res, 405, { error: 'Method Not Allowed' });
}

function readJsonBody(req, res, callback) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 1024 * 1024) {
      req.destroy();
    }
  });
  req.on('end', () => {
    try {
      callback(body ? JSON.parse(body) : {});
    } catch (e) {
      sendJson(res, 400, { error: 'Invalid JSON' });
    }
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(JSON.stringify(data));
}

function readLogStore() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    const data = JSON.parse(raw);
    return normalizeStore(data);
  } catch (e) {
    return normalizeStore({});
  }
}

function writeLogStore(store) {
  ensureDataDir();
  fs.writeFileSync(LOG_FILE, JSON.stringify(normalizeStore(store), null, 2), 'utf8');
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function normalizeStore(data) {
  const refractionLogs = Array.isArray(data.refractionLogs) ? data.refractionLogs.map(createLogEntry) : [];
  const waveLogs = Array.isArray(data.waveLogs) ? data.waveLogs.map(createLogEntry) : [];
  const maxId = [...refractionLogs, ...waveLogs].reduce((max, entry) => Math.max(max, entry.id || 0), 0);
  return {
    runCount: Math.max(Number(data.runCount || 0), maxId),
    refractionLogs: refractionLogs.sort((a, b) => b.id - a.id),
    waveLogs: waveLogs.sort((a, b) => b.id - a.id),
  };
}

function createLogEntry(raw) {
  return {
    id: Number(raw.id || 0),
    timestamp: normalizeTimestamp(raw.timestamp),
    n1: Number(raw.n1 || 0),
    n2: Number(raw.n2 || 0),
    theta1: Number(raw.theta1 || 0),
    theta2: raw.theta2 === null || raw.theta2 === undefined ? null : Number(raw.theta2),
    isTIR: Boolean(raw.isTIR),
    type: raw.type || 'normal',
    quizStatus: raw.quizStatus || null,
    fixedOk: raw.fixedOk !== undefined ? Boolean(raw.fixedOk) : true,
    hasObstacles: Boolean(raw.hasObstacles),
  };
}

function normalizeTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function categoryFor(type) {
  return type === 'wave' ? 'wave' : 'refraction';
}

function trimStore(store) {
  store.refractionLogs = store.refractionLogs.slice(0, 100);
  store.waveLogs = store.waveLogs.slice(0, 100);
}

server.listen(PORT, () => {
  console.log('');
  console.log('  ██████╗ ██╗  ██╗██╗   ██╗ ██████╗  █████╗ ███╗   ███╗███████╗');
  console.log('  ██╔══██╗██║  ██║╚██╗ ██╔╝██╔════╝ ██╔══██╗████╗ ████║██╔════╝');
  console.log('  ██████╔╝███████║ ╚████╔╝ ██║  ███╗███████║██╔████╔██║█████╗  ');
  console.log('  ██╔═══╝ ██╔══██║  ╚██╔╝  ██║   ██║██╔══██║██║╚██╔╝██║██╔══╝  ');
  console.log('  ██║     ██║  ██║   ██║   ╚██████╔╝██║  ██║██║ ╚═╝ ██║███████╗');
  console.log('  ╚═╝     ╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝');
  console.log('');
  console.log(`  Next  →  http://localhost:${PORT}`);
  console.log('');
  console.log('  Ctrl+C で停止');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  エラー: ポート ${PORT} はすでに使用中です。`);
    console.error(`  別のポートを指定してください: node server.js 3001\n`);
  } else {
    console.error('サーバーエラー:', err);
  }
  process.exit(1);
});
