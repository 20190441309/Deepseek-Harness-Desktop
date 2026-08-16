'use strict';

const http = require('http');
const crypto = require('crypto');

const { isValidGithubSpec } = require('../host/install-dsh-plugin-client.js');

const RESTART_DELAY_MS = 500;
const MAX_BODY_BYTES = 64 * 1024;

let active = null;

function desktopInstallEnv() {
  if (!active?.url || !active?.token) {
    return {};
  }
  return {
    DSH_DESKTOP_INSTALL_URL: active.url,
    DSH_DESKTOP_INSTALL_TOKEN: active.token,
  };
}

function desktopInstallReady() {
  return active?.ready || Promise.resolve();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function unauthorized(res) {
  sendJson(res, 401, { ok: false, error: 'unauthorized', needsAllowBuilds: false, allowBuilds: [], spec: '', log: '' });
}

function scheduleRestart(startHarness, delayMs) {
  // The install response is flushed before this timer fires, so the tool
  // result reaches the session log first. The delay is a fixed grace period,
  // not an ACK: a tool/result still slower than the delay would be cut off.
  if (!active) {
    return;
  }
  if (active.restartTimer) {
    clearTimeout(active.restartTimer);
  }
  active.restartTimer = setTimeout(() => {
    if (!active) {
      return;
    }
    active.restartTimer = null;
    if (typeof startHarness === 'function') {
      Promise.resolve(startHarness()).catch(() => {});
    }
  }, delayMs);
}

function createHandler({ installPlugin, startHarness, restartDelayMs }) {
  const delay = Number.isFinite(restartDelayMs) ? restartDelayMs : RESTART_DELAY_MS;
  return async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/install') {
      sendJson(res, 404, { ok: false, error: 'not found' });
      return;
    }
    const expected = `Bearer ${active?.token || ''}`;
    if (!active?.token || req.headers.authorization !== expected) {
      unauthorized(res);
      return;
    }
    let payload;
    try {
      payload = JSON.parse(await readBody(req) || '{}');
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid json', needsAllowBuilds: false, allowBuilds: [], spec: '', log: '' });
      return;
    }
    const spec = String(payload.spec || '').trim();
    const allowBuilds = Array.isArray(payload.allowBuilds) ? payload.allowBuilds.map(String) : [];
    if (!isValidGithubSpec(spec)) {
      sendJson(res, 400, { ok: false, error: '仅支持 github:owner/repo[#ref] 安装规格', needsAllowBuilds: false, allowBuilds: [], spec, log: '' });
      return;
    }
    try {
      const result = await installPlugin(spec, { allowBuilds });
      const body = {
        ok: Boolean(result?.ok),
        needsAllowBuilds: Boolean(result?.needsAllowBuilds),
        allowBuilds: Array.isArray(result?.allowBuilds) ? result.allowBuilds : [],
        spec: String(result?.spec || spec),
        error: String(result?.error || ''),
        log: String(result?.log || ''),
      };
      sendJson(res, 200, body);
      if (body.ok && !body.needsAllowBuilds) {
        scheduleRestart(startHarness, delay);
      }
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        needsAllowBuilds: false,
        allowBuilds: [],
        spec,
        error: error instanceof Error ? error.message : String(error || 'install failed'),
        log: '',
      });
    }
  };
}

function startDesktopInstallControl(options = {}) {
  stopDesktopInstallControl();
  const token = crypto.randomBytes(32).toString('hex');
  const server = http.createServer(createHandler(options));
  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const url = `http://127.0.0.1:${address.port}`;
      if (active) {
        active.url = url;
        active.token = token;
      }
      resolve({ url, token });
    });
  });
  active = {
    url: '',
    token,
    server,
    ready,
    restartTimer: null,
  };
  return { ready, close: stopDesktopInstallControl };
}

function stopDesktopInstallControl() {
  if (!active) {
    return;
  }
  if (active.restartTimer) {
    clearTimeout(active.restartTimer);
  }
  try {
    active.server.close();
  } catch {
    // already closed
  }
  active = null;
}

module.exports = {
  RESTART_DELAY_MS,
  desktopInstallEnv,
  desktopInstallReady,
  startDesktopInstallControl,
  stopDesktopInstallControl,
};
