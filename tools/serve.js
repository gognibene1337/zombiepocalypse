'use strict';
/*
 * Tiny static server for play-testing (alternative to VS Code Live Server).
 *   node tools/serve.js [port]      -> http://localhost:8080/
 * Serves the zombie/ folder. No caching, so a page refresh always gets the latest files.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../zombie');
const PORT = parseInt(process.argv[2], 10) || 8080;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wav': 'audio/wav', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

http.createServer((req, res) => {
    let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (p.endsWith(path.sep)) p = path.join(p, 'index.html');
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        res.writeHead(404); res.end('Not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(p).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log('Serving ' + ROOT + ' at http://localhost:' + PORT + '/'));
