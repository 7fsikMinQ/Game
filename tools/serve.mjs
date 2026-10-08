// 의존성 없는 정적 서버. 같은 Wi-Fi의 아이폰에서 열 수 있도록 LAN 주소를 알려준다.
//   npm start            -> http://localhost:8080
//   PORT=3000 npm start
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8080;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  let file = path.join(root, rel);
  if (!file.startsWith(root)) return res.writeHead(403).end('forbidden');
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    return res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
  }
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `포트 ${port}이(가) 이미 사용 중입니다. PORT=8081 npm start 처럼 다른 포트를 쓰세요.` : e);
  process.exit(1);
});

server.listen(port, '0.0.0.0', () => {
  console.log('\n야구단 개발 서버가 켜졌습니다. 끄려면 Ctrl+C\n');
  console.log(`  이 PC에서      http://localhost:${port}/baseball/`);
  const nets = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
  for (const n of nets) console.log(`  아이폰(같은 Wi-Fi)  http://${n.address}:${port}/baseball/`);
  if (!nets.length) console.log('  (Wi-Fi/네트워크가 연결되어 있지 않습니다)');
  console.log('');
});
