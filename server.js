/* Fourfold — local HTTP server: static files + /api (time, health). */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.opus': 'audio/ogg'
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' ) { send(res, 200, fs.readFileSync(path.join(ROOT, 'index.html')), MIME['.html']); return; }
  if (url === '/api/health') { send(res, 200, JSON.stringify({ ok: true }), MIME['.json']); return; }
  const file = path.join(ROOT, url);
  fs.readFile(file, (err, data) => {
    if (err) { send(res, 404, 'not found'); return; }
    const ext = path.extname(url).toLowerCase();
    send(res, 200, data, MIME[ext] || 'application/octet-stream');
  });
});

server.listen(PORT);

module.exports = server;
