import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2]);
// fileURLToPath, not .pathname: a URL's pathname keeps percent-encoding, so a
// checkout under a directory with a space in it ("…/2 Areas/…") resolved to a
// root containing a literal %20, every request 404'd, and the server answered
// with nothing — the offline test failed with ERR_EMPTY_RESPONSE on the very
// first page load. CI paths have no spaces, so it only ever broke locally.
const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function resolveRequestPath(url = '/') {
  const pathname = decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname);
  const requested = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (requested !== root && !requested.startsWith(`${root}${sep}`)) return null;
  try {
    return statSync(requested).isFile() ? requested : resolve(root, 'index.html');
  } catch {
    return extname(pathname) ? null : resolve(root, 'index.html');
  }
}

createServer((request, response) => {
  const path = resolveRequestPath(request.url);
  if (!path) {
    response.writeHead(404, { 'cache-control': 'no-store' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': contentTypes[extname(path)] || 'application/octet-stream',
    'cache-control': path.endsWith('sw.js') ? 'no-store' : 'public, max-age=0',
  });
  createReadStream(path).pipe(response);
}).listen(port, '127.0.0.1');
