/**
 * Static server for mobile/web browser QA: serves the SPA as-is but swaps
 * `chisacode/daemon-client.bundle.js` for the fake daemon module so the whole
 * real frontend stack runs against an in-memory daemon.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const webRoot = join(here, '..', '..', 'mobile', 'web');
const fakeClientPath = join(here, 'fake-daemon-client.mjs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

function startQaServer(port = 3180) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      let filePath;
      if (pathname === '/chisacode/daemon-client.bundle.js') {
        filePath = fakeClientPath;
      } else {
        const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
        filePath = normalize(join(webRoot, relative));
        if (!filePath.startsWith(webRoot)) {
          response.writeHead(403).end();
          return;
        }
      }
      const body = await readFile(filePath);
      response.writeHead(200, {
        'content-type': MIME[extname(filePath)] || 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

export { startQaServer };

if (import.meta.url === `file://${process.argv[1]}`) {
  startQaServer().then(() => {
    console.log('mobile/web QA server on http://127.0.0.1:3180/');
  });
}
