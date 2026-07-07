/**
 * server.js
 * PhyGame Next — Node.js 静的ファイルサーバー
 * 使用方法: node server.js [ポート番号(デフォルト:3000)]
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.argv[2] ? parseInt(process.argv[2]) : 3000;

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
  let urlPath = req.url.split('?')[0];
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
