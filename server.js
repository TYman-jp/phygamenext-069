/**
 * server.js
 * PhyGame Next — Node.js 静的ファイルサーバー (ローカル開発用)
 * 使用方法: node server.js [ポート番号(デフォルト:3000)]
 *
 * ※ Netlify + Firebase 構成移行により、本番環境のログ保存APIは削除されました。
 *    このサーバーは、ローカルでUIの動作確認をするためだけのものです。
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

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

  // 自動ブラウザ起動
  const cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${cmd} http://localhost:${PORT}`);
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
