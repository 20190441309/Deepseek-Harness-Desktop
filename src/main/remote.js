const http = require('http');
const net = require('net');
const zlib = require('zlib');
const { EventEmitter } = require('events');
const {
  generateToken,
  isAuthorized,
  cookieHeader,
  clearCookieHeader,
  tokenFromHeaders,
  tokensEqual,
  matchingToken,
} = require('../shared/remote-auth');
const { listLanAddresses, pairingUrl, publicUrl } = require('../shared/lan');
const { createDevice, normalizeDevices, publicDevices } = require('../shared/remote-devices');
const { RelayClient } = require('./relay-client');

const DEFAULT_PORT = 3180;
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

function loopbackOrigin(port) {
  return `http://127.0.0.1:${Number(port)}`;
}

function rewriteProxyHeaders(headers, target, options = {}) {
  const keepUpgrade = Boolean(options.upgrade);
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const name = String(key).toLowerCase();
    if (name.startsWith('sec-fetch-')) {
      continue;
    }
    if (!keepUpgrade && HOP_BY_HOP.has(name)) {
      continue;
    }
    out[name] = value;
  }
  const origin = loopbackOrigin(target.port);
  out.host = `127.0.0.1:${target.port}`;
  if (out.origin) {
    out.origin = origin;
  }
  if (out.referer) {
    try {
      const current = new URL(out.referer);
      out.referer = `${origin}${current.pathname}${current.search}`;
    } catch {
      out.referer = `${origin}/`;
    }
  }
  return out;
}

function acceptsGzip(headers) {
  return /(?:^|,|\s)gzip(?:$|,|;|\s)/i.test(String((headers && headers['accept-encoding']) || ''));
}

function shouldGzipProxy(headers, contentType) {
  if (!acceptsGzip(headers)) {
    return false;
  }
  if (headers && headers['content-encoding']) {
    return false;
  }
  return /javascript|json|text\/html|text\/css|image\/svg/i.test(String(contentType || ''));
}

function headerLines(headers) {
  return Object.entries(headers)
    .map(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return values.map((item) => `${key}: ${item}`).join('\r\n');
    })
    .join('\r\n');
}

function loginPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#0b0d12" />
  <title>Deepseek Harness 远程</title>
  <style>
    :root { color-scheme: dark; }
    html, body { margin: 0; min-height: 100%; background: #0b0d12; color: #e8eef9; font: 16px/1.45 system-ui, sans-serif; }
    main { max-width: 420px; margin: 0 auto; padding: 48px 20px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { color: #8b93a7; margin: 0 0 20px; }
    input, button { width: 100%; box-sizing: border-box; font: inherit; border-radius: 10px; padding: 12px 14px; }
    input { border: 1px solid rgba(232,238,249,.14); background: rgba(232,238,249,.06); color: inherit; margin-bottom: 12px; }
    button { border: 0; background: #6ea8ff; color: #081018; font-weight: 650; }
  </style>
</head>
<body>
  <main>
    <h1>连接本机 Harness</h1>
    <p>用桌面端侧栏手机按钮弹出的二维码打开本页。密钥在地址的 #offer= 里，不会发到服务器查询串。</p>
    <form method="post" action="/__remote__/login">
      <input name="token" type="password" autocomplete="current-password" placeholder="访问令牌" required />
      <button type="submit">进入</button>
    </form>
  </main>
  <script>
    (function () {
      var hash = location.hash || '';
      var match = hash.match(/(?:^|#|&)offer=([^&]+)/);
      if (!match) return;
      try {
        var padded = match[1].replace(/-/g, '+').replace(/_/g, '/');
        while (padded.length % 4) padded += '=';
        var json = JSON.parse(decodeURIComponent(escape(atob(padded))));
        var token = json && json.token;
        if (!token) return;
        var body = new URLSearchParams();
        body.set('token', token);
        fetch('/__remote__/login', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: body,
          credentials: 'same-origin',
          redirect: 'follow'
        }).then(function (res) {
          if (res.ok || res.redirected) location.replace('/');
        }).catch(function () {});
      } catch (e) {}
    })();
  </script>
</body>
</html>`;
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseFormToken(body) {
  try {
    return new URLSearchParams(body).get('token') || '';
  } catch {
    return '';
  }
}

class RemoteGateway extends EventEmitter {
  constructor(options = {}) {
    super();
    this.getTarget = options.getTarget || (() => null);
    this.getConfig = options.getConfig || (() => ({}));
    this.saveConfig = options.saveConfig || (() => ({}));
    this.server = null;
    this.error = '';
    this.port = 0;
    this.token = '';
    this.target = null;
    this.sockets = new Map();
    this.relay = new RelayClient({
      getLocal: () => (this.port ? { port: this.port } : null),
    });
    this.relay.on('connected', () => {
      this.error = '';
      this.emit('listening', this.snapshot());
    });
  }

  snapshot() {
    const config = this.getConfig() || {};
    const token = config.remoteToken || this.token || '';
    const port = this.port || Number(config.remotePort) || DEFAULT_PORT;
    const mode = config.remoteMode === 'relay' ? 'relay' : 'lan';
    const relayUrl = config.remoteRelayUrl || '';
    const addresses = listLanAddresses();
    const relay = this.relay ? this.relay.snapshot() : { connected: false, url: '', error: '' };
    const relayDown = mode === 'relay' && Boolean(config.remoteEnabled) && !relay.connected;
    return {
      enabled: Boolean(config.remoteEnabled),
      listening: Boolean(this.server && this.port),
      port,
      token,
      mode,
      relayUrl,
      relayConnected: Boolean(relay.connected),
      relayError: relay.error || '',
      error: relay.connected
        ? ''
        : (this.error || relay.error || (relayDown ? '桌面还没连上中继' : '')),
      target: this.target,
      devices: publicDevices(this.storedDevices(), this.onlineDeviceIds()),
      urls: addresses.map((address) => ({
        address,
        url: publicUrl(address, port),
        pairingUrl: pairingUrl(address, port, token, { mode, relay: relayUrl }),
      })),
    };
  }

  ensureToken() {
    const config = this.getConfig() || {};
    if (config.remoteToken) {
      this.token = config.remoteToken;
      return config.remoteToken;
    }
    const token = generateToken();
    this.token = token;
    this.saveConfig({ remoteToken: token });
    return token;
  }

  rotateToken() {
    const token = generateToken();
    this.token = token;
    this.saveConfig({ remoteToken: token });
    return token;
  }

  storedDevices() {
    return normalizeDevices((this.getConfig() || {}).remoteDevices);
  }

  onlineDeviceIds() {
    const ids = [];
    for (const [id, sockets] of this.sockets) {
      if (sockets && sockets.size) {
        ids.push(id);
      }
    }
    return ids;
  }

  authTokens() {
    return [this.token, ...this.storedDevices().map((device) => device.token)].filter(Boolean);
  }

  deviceForToken(presented) {
    if (!presented) {
      return null;
    }
    for (const device of this.storedDevices()) {
      if (tokensEqual(presented, device.token)) {
        return device;
      }
    }
    return null;
  }

  persistDevices(devices) {
    this.saveConfig({ remoteDevices: normalizeDevices(devices) });
  }

  touchDevice(id, options = {}) {
    const now = Date.now();
    const devices = this.storedDevices();
    const current = devices.find((device) => device.id === id);
    if (!current) {
      return;
    }
    const last = Date.parse(current.lastSeenAt) || 0;
    if (!options.force && now - last < 60_000) {
      return;
    }
    const stamp = new Date(now).toISOString();
    this.persistDevices(devices.map((device) => (
      device.id === id ? { ...device, lastSeenAt: stamp } : device
    )));
  }

  pairDevice(req) {
    const presented = tokenFromHeaders(req.headers || {}, req.url || '/');
    const existing = this.deviceForToken(presented);
    if (existing) {
      this.touchDevice(existing.id, { force: true });
      return this.storedDevices().find((device) => device.id === existing.id) || existing;
    }
    const device = createDevice(req.headers && req.headers['user-agent'], generateToken());
    this.persistDevices([...this.storedDevices(), device]);
    return device;
  }

  unbindDevice(id) {
    const devices = this.storedDevices();
    const next = devices.filter((device) => device.id !== id);
    if (next.length === devices.length) {
      return this.snapshot();
    }
    this.dropSockets(id);
    this.persistDevices(next);
    return this.snapshot();
  }

  trackSocket(deviceId, socket) {
    if (!deviceId || !socket) {
      return;
    }
    let sockets = this.sockets.get(deviceId);
    if (!sockets) {
      sockets = new Set();
      this.sockets.set(deviceId, sockets);
    }
    sockets.add(socket);
    const drop = () => {
      sockets.delete(socket);
      if (!sockets.size) {
        this.sockets.delete(deviceId);
      }
    };
    socket.once('close', drop);
    socket.once('error', drop);
  }

  dropSockets(deviceId) {
    const sockets = this.sockets.get(deviceId);
    if (!sockets) {
      return;
    }
    this.sockets.delete(deviceId);
    for (const socket of sockets) {
      try {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      } catch {
        // The socket may already be half-closed; destroy still drops the bind.
      }
      socket.destroy();
    }
  }

  async sync() {
    const config = this.getConfig() || {};
    const target = this.getTarget();
    if (!config.remoteEnabled) {
      await this.stop();
      return this.snapshot();
    }
    if (!target || !target.port) {
      this.error = 'Harness 还没就绪';
      await this.stop();
      return this.snapshot();
    }
    const token = this.ensureToken();
    const port = Number(config.remotePort) || DEFAULT_PORT;
    const same = this.server
      && this.port === port
      && this.token === token
      && this.target
      && this.target.port === target.port;
    if (same) {
      this.error = '';
      this.target = target;
      await this.syncRelay(config);
      return this.snapshot();
    }
    await this.stop();
    await this.start({ port, token, target });
    await this.syncRelay(config);
    return this.snapshot();
  }

  async syncRelay(config) {
    if (!this.relay) {
      return;
    }
    if (config.remoteMode === 'relay' && config.remoteRelayUrl && this.server) {
      try {
        await this.relay.sync(config.remoteRelayUrl);
        this.error = this.relay.connected ? '' : (this.relay.error || this.error);
      } catch (error) {
        this.error = error.message || String(error);
      }
      return;
    }
    await this.relay.disconnect();
  }

  async start({ port, token, target }) {
    if (!token) {
      throw new Error('没有访问令牌时不能开放局域网');
    }
    if (!target || !target.port) {
      throw new Error('Harness 还没就绪');
    }
    this.token = token;
    this.target = { host: '127.0.0.1', port: Number(target.port) };
    this.error = '';
    await new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handleHttp(req, res);
      });
      server.on('upgrade', (req, socket, head) => {
        this.handleUpgrade(req, socket, head);
      });
      server.on('error', (error) => {
        this.error = error.message;
        this.emit('error', error);
        if (!this.server) {
          reject(error);
        }
      });
      server.listen(port, '0.0.0.0', () => {
        this.server = server;
        this.port = server.address().port;
        this.emit('listening', this.snapshot());
        resolve();
      });
    });
  }

  async stop() {
    if (this.relay) {
      await this.relay.disconnect();
    }
    for (const id of [...this.sockets.keys()]) {
      this.dropSockets(id);
    }
    const server = this.server;
    this.server = null;
    this.port = 0;
    this.target = null;
    if (!server) {
      return;
    }
    await new Promise((resolve) => {
      server.close(() => resolve());
      setTimeout(resolve, 400);
    });
  }

  wantsHtml(req) {
    return /text\/html|\*\/\*/i.test(String(req.headers.accept || ''))
      && req.method === 'GET';
  }

  prefersHtml(req) {
    return /text\/html/i.test(String(req.headers.accept || ''))
      && req.method === 'GET';
  }

  send(res, status, headers, body) {
    res.writeHead(status, headers);
    res.end(body);
  }

  async handleHttp(req, res) {
    const url = req.url || '/';
    const target = this.target;
    if (!target) {
      this.send(res, 503, { 'content-type': 'text/plain; charset=utf-8' }, 'Harness 还没就绪');
      return;
    }

    if (req.method === 'POST' && url.startsWith('/__remote__/login')) {
      let body = '';
      try {
        body = await readBody(req);
      } catch {
        this.send(res, 413, { 'content-type': 'text/plain; charset=utf-8' }, '请求过大');
        return;
      }
      const token = parseFormToken(body);
      if (!tokensEqual(token, this.token)) {
        this.send(res, 401, { 'content-type': 'text/html; charset=utf-8' }, loginPage());
        return;
      }
      const device = this.pairDevice(req);
      this.send(res, 302, { location: '/', 'set-cookie': cookieHeader(device.token) }, '');
      return;
    }

    if (url.startsWith('/__remote__/logout')) {
      this.send(res, 302, { location: '/', 'set-cookie': clearCookieHeader() }, '');
      return;
    }

    const parsed = new URL(url, 'http://dsh.remote');
    const queryToken = parsed.searchParams.get('token');
    if (queryToken) {
      parsed.searchParams.delete('token');
      const next = `${parsed.pathname}${parsed.search}`;
      const location = next === '' ? '/' : next;
      if (tokensEqual(queryToken, this.token)) {
        const device = this.pairDevice(req);
        this.send(res, 302, { location, 'set-cookie': cookieHeader(device.token) }, '');
        return;
      }
      const existing = this.deviceForToken(queryToken);
      if (existing) {
        this.touchDevice(existing.id, { force: true });
        this.send(res, 302, { location, 'set-cookie': cookieHeader(existing.token) }, '');
        return;
      }
    }

    const presented = matchingToken(req.headers, url, this.authTokens());
    if (!presented) {
      if (this.wantsHtml(req)) {
        this.send(res, 401, { 'content-type': 'text/html; charset=utf-8' }, loginPage());
        return;
      }
      this.send(res, 401, { 'content-type': 'text/plain; charset=utf-8' }, 'unauthorized');
      return;
    }
    let device = this.deviceForToken(presented);
    if (!device && tokensEqual(presented, this.token) && this.prefersHtml(req)) {
      device = this.pairDevice({ headers: { ...req.headers, cookie: '' }, url: '/' });
      this.send(res, 302, { location: url, 'set-cookie': cookieHeader(device.token) }, '');
      return;
    }
    if (device) {
      this.touchDevice(device.id);
    }

    const headers = rewriteProxyHeaders(req.headers, target);
    const proxy = http.request({
      hostname: '127.0.0.1',
      port: target.port,
      path: url,
      method: req.method,
      headers,
    }, (upstream) => {
      const outHeaders = { ...upstream.headers };
      delete outHeaders['content-length'];
      if (/text\/html/i.test(String(outHeaders['content-type'] || ''))) {
        outHeaders['cache-control'] = 'no-store';
      }
      const gzip = shouldGzipProxy(req.headers, outHeaders['content-type'])
        && !outHeaders['content-encoding'];
      if (gzip) {
        outHeaders['content-encoding'] = 'gzip';
        delete outHeaders['content-length'];
      }
      res.writeHead(upstream.statusCode || 502, outHeaders);
      if (gzip) {
        upstream.pipe(zlib.createGzip()).pipe(res);
        return;
      }
      upstream.pipe(res);
    });
    proxy.on('error', () => {
      if (!res.headersSent) {
        this.send(res, 502, { 'content-type': 'text/plain; charset=utf-8' }, 'Harness 不可达');
      } else {
        res.destroy();
      }
    });
    req.pipe(proxy);
  }

  handleUpgrade(req, socket, head) {
    const target = this.target;
    if (!target || !isAuthorized(req.headers, req.url || '/', this.authTokens())) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const presented = matchingToken(req.headers, req.url || '/', this.authTokens());
    const device = this.deviceForToken(presented);
    if (device) {
      this.touchDevice(device.id, { force: true });
      this.trackSocket(device.id, socket);
    }
    const headers = rewriteProxyHeaders(req.headers, target, { upgrade: true });
    const request = [
      `${req.method} ${req.url} HTTP/1.1`,
      headerLines(headers),
      '',
      '',
    ].join('\r\n');
    const upstream = net.connect(target.port, '127.0.0.1', () => {
      upstream.write(request);
      if (head && head.length) {
        upstream.write(head);
      }
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    const fail = () => {
      socket.destroy();
      upstream.destroy();
    };
    upstream.on('error', fail);
    socket.on('error', fail);
  }
}

module.exports = {
  RemoteGateway,
  rewriteProxyHeaders,
  shouldGzipProxy,
  DEFAULT_PORT,
};
