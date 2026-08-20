/** Loopback workspace file preview: GET-only, token-prefixed, cwd-confined. */

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { loadWorkspaceAuthority } = require('./workspace-authority');

const MIME = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  xhtml: 'application/xhtml+xml',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json',
  map: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  wasm: 'application/wasm',
  pdf: 'application/pdf',
};

function mimeFor(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

function hostIsLoopback(host) {
  if (typeof host !== 'string' || host.trim() === '') return false;
  const hostname = host.trim().split(':')[0].toLowerCase();
  return hostname === '127.0.0.1';
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

/**
 * Serve workspace files on 127.0.0.1 behind an unguessable path token.
 * @param {{ authority?: { resolveInside: Function, resolveAuthorizedCwd: Function } }} [options]
 */
function createWorkspacePreviewController(options = {}) {
  const authority = options.authority ?? loadWorkspaceAuthority();
  const tokenCwds = new Map();
  const cwdTokens = new Map();
  let server = null;
  let port = 0;
  let listening = null;

  function ensureListen() {
    if (listening) return listening;
    listening = new Promise((resolve, reject) => {
      server = http.createServer(handle);
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        port = address && typeof address === 'object' ? address.port : 0;
        resolve();
      });
    });
    return listening;
  }

  function handle(req, res) {
    if (req.method !== 'GET') {
      send(res, 405, 'Method Not Allowed', { Allow: 'GET' });
      return;
    }
    if (!hostIsLoopback(req.headers.host)) {
      send(res, 400, 'Bad Host');
      return;
    }
    let parsed;
    try {
      parsed = new URL(req.url, 'http://127.0.0.1');
    } catch {
      send(res, 400, 'Bad URL');
      return;
    }
    const segments = parsed.pathname.split('/').filter((part) => part.length > 0);
    const token = segments[0];
    const rest = segments.slice(1);
    if (!token || rest.length === 0 || rest.some((part) => part === '.' || part === '..')) {
      send(res, 404, 'Not Found');
      return;
    }
    const cwd = tokenCwds.get(token);
    if (cwd === undefined) {
      send(res, 404, 'Not Found');
      return;
    }
    const relative = rest.join('/');
    const target = authority.resolveInside(cwd, relative);
    if (!target) {
      send(res, 404, 'Not Found');
      return;
    }
    let stat;
    try {
      stat = fs.statSync(target);
    } catch {
      send(res, 404, 'Not Found');
      return;
    }
    if (stat.isDirectory()) {
      send(res, 403, 'Forbidden');
      return;
    }
    let body;
    try {
      body = fs.readFileSync(target);
    } catch {
      send(res, 404, 'Not Found');
      return;
    }
    send(res, 200, body, { 'Content-Type': mimeFor(target) });
  }

  async function fileUrl(input = {}) {
    const cwd = input.cwd;
    const relativePath = input.relativePath;
    if (typeof relativePath !== 'string' || relativePath.trim() === '') {
      return { ok: false, message: 'File path is required.' };
    }
    const base = authority.resolveAuthorizedCwd(cwd);
    const target = authority.resolveInside(cwd, relativePath);
    if (!base || !target) {
      return { ok: false, message: 'Path is outside the workspace.' };
    }
    let stat;
    try {
      stat = fs.statSync(target);
    } catch {
      return { ok: false, message: 'File not found.' };
    }
    if (stat.isDirectory()) {
      return { ok: false, message: 'Directories cannot be previewed.' };
    }
    await ensureListen();
    let token = cwdTokens.get(base);
    if (token === undefined) {
      token = crypto.randomBytes(16).toString('base64url');
      cwdTokens.set(base, token);
      tokenCwds.set(token, base);
    }
    const relative = path.relative(base, target).split(path.sep).join('/');
    const encoded = relative.split('/').map((part) => encodeURIComponent(part)).join('/');
    return { ok: true, url: `http://127.0.0.1:${port}/${token}/${encoded}` };
  }

  function close() {
    const current = server;
    server = null;
    port = 0;
    listening = null;
    tokenCwds.clear();
    cwdTokens.clear();
    if (!current) return Promise.resolve();
    return new Promise((resolve) => {
      current.close(() => resolve());
    });
  }

  return { fileUrl, close };
}

module.exports = { createWorkspacePreviewController };
