import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {siteFiles} from './site-files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.py': 'text/plain',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.svg': 'image/svg+xml',
};

http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const isVendorAsset = /^vendor\/(?:[\w-][\w.-]*\/)*[\w-][\w.-]*$/.test(relative);
    if (siteFiles.includes(relative) || isVendorAsset) {
      const data = await readFile(path.join(root, relative));
      const type = contentTypes[path.extname(relative)] || 'application/octet-stream';
      res.writeHead(200, {'Content-Type': type}).end(data);
      return;
    }
  } catch {
    // Invalid paths and missing assets return the same response.
  }
  res.writeHead(404).end('Not found');
}).listen(4173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4173'));
