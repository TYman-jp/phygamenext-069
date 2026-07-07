/**
 * server.js
 * PhyGame Next — Node.js 静的ファイルサーバー (サーバーサイドログ保存対応)
 * 使用方法: node server.js [ポート番号(デフォルト:3000)]
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.argv[2] ? parseInt(process.argv[2]) : 3000;

// ログデータ保存先設定
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

const getLogFilePath = (category) => path.join(DATA_DIR, `logs_${category}.json`);

function readLogs(category) {
  const filePath = getLogFilePath(category);
  if (!fs.existsSync(filePath)) {
    return { runCount: 0, logs: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { runCount: 0, logs: [] };
  }
}

function writeLogs(category, data) {
  const filePath = getLogFilePath(category);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

const server = http.createServer((req, res) => {
  // URLパスを正規化
  let urlPath = req.url.split('?')[0];
  
  // API ルーティングの処理
  if (urlPath.startsWith('/api/logs/')) {
    const category = urlPath.split('/').pop(); // 'refraction' or 'wave'
    if (category !== 'refraction' && category !== 'wave') {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    if (req.method === 'GET') {
      const logs = readLogs(category);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(logs));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const current = readLogs(category);
          
          if (payload.migrate && Array.isArray(payload.logs)) {
            // マイグレーション用一括書き込み
            payload.logs.forEach(entry => {
              if (!current.logs.some(existing => existing.id === entry.id)) {
                current.logs.push(entry);
              }
            });
            current.logs.sort((a, b) => b.id - a.id);
            current.runCount = Math.max(current.runCount, payload.runCount || 0);
            writeLogs(category, current);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, runCount: current.runCount }));
            return;
          }
          
          // 単一ログ追加
          const entry = payload;
          current.runCount = current.runCount + 1;
          entry.id = current.runCount;
          entry.timestamp = new Date().toISOString();
          
          current.logs.unshift(entry);
          if (current.logs.length > 100) {
            current.logs = current.logs.slice(0, 100);
          }
          
          writeLogs(category, current);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, entry, runCount: current.runCount }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Invalid JSON');
        }
      });
      return;
    }

    if (req.method === 'DELETE') {
      // ログクリア
      const current = { runCount: 0, logs: [] };
      writeLogs(category, current);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true }));
      return;
    }
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

  // サーバー起動時に自動でブラウザを開く
  const url = `http://localhost:${PORT}`;
  const startCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${startCmd} ${url}`, (err) => {
    if (err) {
      console.log(`  ブラウザの自動起動に失敗しました。手動で ${url} を開いてください。`);
    } else {
      console.log(`  ブラウザで ${url} を自動で開きました。`);
    }
  });
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

