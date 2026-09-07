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
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); }
  catch (e) { send(res, 400, 'bad request'); return; }
  if (url === '/' ) { send(res, 200, fs.readFileSync(path.join(ROOT, 'index.html')), MIME['.html']); return; }
  if (url === '/api/health') { send(res, 200, JSON.stringify({ ok: true }), MIME['.json']); return; }

  // Contain every request under ROOT: path.join alone still resolves "..".
  const file = path.resolve(ROOT, '.' + path.posix.normalize(url));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { send(res, 403, 'forbidden'); return; }

  fs.readFile(file, (err, data) => {
    if (err) { send(res, 404, 'not found'); return; }
    const ext = path.extname(file).toLowerCase();
    send(res, 200, data, MIME[ext] || 'application/octet-stream');
  });
});

server.listen(PORT);

module.exports = server;
