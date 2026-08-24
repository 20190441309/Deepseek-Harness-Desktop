const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { generateToken } = require('../shared/remote-auth');
const { pairingUrl, normalizeRelayOrigin } = require('../shared/lan');
const { encodeOffer, decodeOffer, offerFromHash } = require('../shared/offer');
const { RemoteGateway, createDisabledRemote, rewriteProxyHeaders, shouldGzipProxy } = require('./remote');
const { RelayClient } = require('./relay-client');
const { RelayServer } = require('../relay/server');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function request(port, path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
  const body = await response.text();
  return { status: response.status, body, headers: response.headers };
}

function insecureRelay(hostToken) {
  return new RelayServer({ hostToken, allowInsecureHttp: true });
}

function insecureRelayClient(hostToken, options = {}) {
  return new RelayClient({
    ...options,
    allowInsecureHttp: true,
    getHostToken: () => hostToken,
  });
}

test('disabled remote stub does not listen or create an HTTP server', () => {
  const original = http.createServer;
  let created = 0;
  http.createServer = (...args) => {
    created += 1;
    return original.apply(http, args);
  };
  try {
    const remote = createDisabledRemote();
    const synced = remote.sync();
    const snap = remote.snapshot();
    assert.notEqual(snap.listening, true);
    assert.equal(snap.available, false);
    assert.equal(snap.enabled, false);
    assert.deepEqual(synced, snap);
    assert.equal(created, 0);
    remote.stop();
    assert.equal(created, 0);
    assert.deepEqual(remote.sync(), snap);
    remote.stop();
    assert.deepEqual(remote.snapshot(), {
      available: false,
      enabled: false,
      listening: false,
    });
  } finally {
    http.createServer = original;
  }
});

test('live gateway snapshot marks the remote face available', () => {
  const gateway = new RemoteGateway({
    getConfig: () => ({ remoteEnabled: false }),
  });
  const snap = gateway.snapshot();
  assert.equal(snap.available, true);
  assert.equal(snap.enabled, false);
  assert.equal(snap.listening, false);
});

test('main process constructs RemoteGateway instead of the disabled stub', () => {
  const index = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  assert.match(index, /new RemoteGateway/);
  assert.doesNotMatch(index, /createDisabledRemote/);
  assert.match(index, /getTarget:/);
});

test('relay close destroys upgraded clients and completes pending responses', async () => {
  const relay = insecureRelay('host-token-1234567890');
  const host = { destroyed: false, destroy() { this.destroyed = true; } };
  const client = { destroyed: false, destroy() { this.destroyed = true; } };
  const response = {
    headersSent: false,
    status: 0,
    body: '',
    writeHead(status) {
      this.status = status;
      this.headersSent = true;
    },
    end(body) {
      this.body = body;
    },
  };
  relay.host = host;
  relay.pending.set(1, { res: response });
  relay.upgrades.set(2, client);

  await relay.close();

  assert.equal(host.destroyed, true);
  assert.equal(client.destroyed, true);
  assert.equal(response.status, 502);
  assert.equal(response.body, 'desktop disconnected');
  assert.equal(relay.pending.size, 0);
  assert.equal(relay.upgrades.size, 0);
});

test('shouldGzipProxy gzips script and html when the client asks for gzip', () => {
  assert.equal(shouldGzipProxy({ 'accept-encoding': 'gzip, deflate' }, 'text/javascript; charset=utf-8'), true);
  assert.equal(shouldGzipProxy({ 'accept-encoding': 'gzip' }, 'text/html; charset=utf-8'), true);
  assert.equal(shouldGzipProxy({ 'accept-encoding': 'identity' }, 'text/javascript'), false);
  assert.equal(shouldGzipProxy({ 'accept-encoding': 'gzip' }, 'application/json'), false);
  assert.equal(shouldGzipProxy({ 'accept-encoding': 'gzip' }, 'text/plain'), false);
  assert.equal(shouldGzipProxy({ 'accept-encoding': 'gzip', 'content-encoding': 'br' }, 'text/javascript'), false);
});

test('rewriteProxyHeaders forces loopback Host and Origin', () => {
  const headers = rewriteProxyHeaders({
    host: '192.168.1.8:3180',
    origin: 'http://192.168.1.8:3180',
    referer: 'http://192.168.1.8:3180/chat',
    'sec-fetch-site': 'cross-site',
    connection: 'keep-alive',
  }, { port: 3080 });
  assert.equal(headers.host, '127.0.0.1:3080');
  assert.equal(headers.origin, 'http://127.0.0.1:3080');
  assert.equal(headers.referer, 'http://127.0.0.1:3080/chat');
  assert.equal(headers['sec-fetch-site'], undefined);
  assert.equal(headers.connection, undefined);
});

test('rewriteProxyHeaders strips cookie and authorization so device tokens stay off loopback', () => {
  const headers = rewriteProxyHeaders({
    host: '192.168.1.8:3180',
    cookie: 'dsh_remote=device-secret',
    authorization: 'Bearer device-secret',
  }, { port: 3080 });
  assert.equal(headers.host, '127.0.0.1:3080');
  assert.equal(headers.cookie, undefined);
  assert.equal(headers.authorization, undefined);
});

test('pairingUrl puts the token in the hash offer, not the query', () => {
  const url = pairingUrl('10.0.0.4', 3180, 'abc');
  assert.equal(url.startsWith('http://10.0.0.4:3180/'), true);
  assert.equal(url.includes('?token='), false);
  const offer = offerFromHash(new URL(url).hash);
  assert.equal(offer.token, 'abc');
  assert.equal(offer.mode, 'lan');
});

test('pairingUrl for relay uses the relay origin and keeps the secret in the hash', () => {
  const url = pairingUrl('10.0.0.4', 3180, 'abc', { mode: 'relay', relay: 'https://relay.example:8787/path' });
  assert.equal(url.startsWith('https://relay.example:8787/#offer='), true);
  const offer = offerFromHash(new URL(url).hash);
  assert.equal(offer.mode, 'relay');
  assert.equal(offer.relay, 'https://relay.example:8787');
  assert.equal(offer.token, 'abc');
});

test('offer encode/decode round-trips and rejects junk', () => {
  const encoded = encodeOffer({ v: 1, token: 'secret', mode: 'lan' });
  assert.equal(decodeOffer(encoded).token, 'secret');
  assert.equal(decodeOffer('@@@'), null);
  assert.equal(decodeOffer(encodeOffer({ v: 2, token: 'x' })), null);
  assert.equal(normalizeRelayOrigin('ftp://nope'), '');
  assert.equal(normalizeRelayOrigin('http://relay.example'), '');
  assert.equal(normalizeRelayOrigin('not a url'), '');
});

test('gateway refuses to start without a token', async () => {
  const gateway = new RemoteGateway();
  await assert.rejects(() => gateway.start({ port: 0, token: '', target: { port: 1 } }), /令牌/);
});

test('gateway sync stops an active listener when Harness is no longer ready', async () => {
  const upstream = http.createServer((_req, res) => res.end('ok'));
  const upstreamPort = await listen(upstream);
  const token = generateToken();
  let target = { port: upstreamPort };
  const gateway = new RemoteGateway({
    getTarget: () => target,
    getConfig: () => ({
      remoteEnabled: true,
      remoteToken: token,
      remoteMode: 'lan',
    }),
  });
  try {
    await gateway.start({ port: 0, token, target });
    assert.equal(gateway.snapshot().listening, true);

    target = null;
    await gateway.sync();
    assert.equal(gateway.snapshot().listening, false);
    assert.equal(gateway.snapshot().target, null);
  } finally {
    await gateway.stop();
    await close(upstream);
  }
});

test('gateway proxies an authorized request and rewrites Host', async () => {
  let seenHost = '';
  const upstream = http.createServer((req, res) => {
    seenHost = req.headers.host;
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok-from-dsh');
  });
  const upstreamPort = await listen(upstream);
  const token = generateToken();
  const gateway = new RemoteGateway();
  await gateway.start({
    port: 0,
    token,
    target: { port: upstreamPort },
  });
  const port = gateway.port || gateway.server.address().port;
  gateway.port = port;

  const denied = await request(port, '/api/ping');
  assert.equal(denied.status, 401);
  assert.match(denied.body, /#offer=/);

  const allowed = await request(port, '/api/ping', {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body, 'ok-from-dsh');
  assert.equal(seenHost, `127.0.0.1:${upstreamPort}`);

  const leaked = await request(port, `/?token=${token}`, { redirect: 'manual' });
  assert.equal(leaked.status, 401);
  assert.equal(String(leaked.headers.get('set-cookie') || ''), '');

  const snap = gateway.snapshot();
  assert.equal(snap.mode, 'lan');
  assert.equal('qrSvg' in (snap.urls[0] || {}), false);

  await gateway.stop();
  await close(upstream);
});

test('self-host relay forwards an authorized request to the local gateway', async () => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('via-relay');
  });
  const upstreamPort = await listen(upstream);
  const token = generateToken();
  const hostToken = generateToken();
  const gateway = new RemoteGateway();
  await gateway.start({
    port: 0,
    token,
    target: { port: upstreamPort },
  });
  const gatewayPort = gateway.port || gateway.server.address().port;
  gateway.port = gatewayPort;

  const relay = insecureRelay(hostToken);
  const relayPort = await relay.listen(0, '127.0.0.1');
  const client = insecureRelayClient(hostToken, {
    getLocal: () => ({ port: gatewayPort }),
  });
  await client.connect(`http://127.0.0.1:${relayPort}`, hostToken);
  assert.equal(client.connected, true);

  const denied = await request(relayPort, '/api/ping');
  assert.equal(denied.status, 401);

  const allowed = await request(relayPort, '/api/ping', {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body, 'via-relay');

  await client.disconnect();
  await relay.close();
  await gateway.stop();
  await close(upstream);
});

function waitFor(predicate, timeoutMs = 3000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        if (predicate()) {
          resolve();
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('timed out'));
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

test('relay without a desktop host tells the phone to wait', async () => {
  const relay = insecureRelay(generateToken());
  const relayPort = await relay.listen(0, '127.0.0.1');
  const denied = await request(relayPort, '/');
  assert.equal(denied.status, 503);
  assert.match(denied.body, /桌面还没连上中继/);
  await relay.close();
});

test('switching from relay to lan cancels an in-flight relay handshake', async () => {
  const upstream = http.createServer((_req, res) => res.end('ok'));
  const upstreamPort = await listen(upstream);
  const token = generateToken();
  const hostToken = generateToken();
  const blackhole = net.createServer();
  const relayPort = await listen(blackhole);
  const stored = {
    remoteEnabled: true,
    remoteToken: token,
    remoteMode: 'relay',
    remoteRelayUrl: `http://127.0.0.1:${relayPort}`,
    remoteRelayToken: hostToken,
  };
  const gateway = new RemoteGateway({
    getTarget: () => ({ port: upstreamPort }),
    getConfig: () => ({ ...stored }),
    saveConfig: (patch) => {
      Object.assign(stored, patch);
      return stored;
    },
    relayOptions: { allowInsecureHttp: true },
  });
  await gateway.start({ port: 0, token, target: { port: upstreamPort } });
  stored.remotePort = gateway.port;
  const connecting = gateway.sync();
  await waitFor(() => Boolean(gateway.relay && gateway.relay.socket));
  stored.remoteMode = 'lan';
  await gateway.sync();
  assert.equal(gateway.snapshot().mode, 'lan');
  assert.equal(gateway.snapshot().error, '');
  assert.equal(gateway.snapshot().relayError, '');
  assert.equal(gateway.relay.socket, null);
  assert.equal(gateway.relay.shouldRun, false);
  await gateway.stop();
  await connecting.catch(() => {});
  await close(blackhole);
  await close(upstream);
});

test('LAN mode never connects relay and relay mode disconnects when switched back', async () => {
  const upstream = http.createServer((_req, res) => res.end('ok'));
  const upstreamPort = await listen(upstream);
  const token = generateToken();
  const hostToken = generateToken();
  const relay = insecureRelay(hostToken);
  const relayPort = await relay.listen(0, '127.0.0.1');
  const stored = {
    remoteEnabled: true,
    remoteToken: token,
    remoteMode: 'lan',
    remoteRelayUrl: `http://127.0.0.1:${relayPort}`,
    remoteRelayToken: hostToken,
  };
  const gateway = new RemoteGateway({
    getTarget: () => ({ port: upstreamPort }),
    getConfig: () => ({ ...stored }),
    saveConfig: (patch) => {
      Object.assign(stored, patch);
      return stored;
    },
    relayOptions: { allowInsecureHttp: true },
  });
  await gateway.start({ port: 0, token, target: { port: upstreamPort } });
  stored.remotePort = gateway.port;
  await gateway.sync();
  assert.equal(gateway.relay.connected, false);
  assert.equal(gateway.snapshot().listening, true);
  stored.remoteMode = 'relay';
  await gateway.sync();
  assert.equal(gateway.relay.connected, true);
  assert.equal(gateway.snapshot().listening, true);
  stored.remoteMode = 'lan';
  await gateway.sync();
  assert.equal(gateway.relay.connected, false);
  stored.remoteEnabled = false;
  await gateway.sync();
  assert.equal(gateway.relay.connected, false);
  assert.equal(gateway.snapshot().listening, false);
  await gateway.stop();
  await relay.close();
  await close(upstream);
});

test('relay client sync keeps an in-flight socket to the same origin', async () => {
  const blackhole = net.createServer();
  const relayPort = await listen(blackhole);
  const hostToken = generateToken();
  const client = insecureRelayClient(hostToken, { handshakeTimeoutMs: 5000 });
  const connecting = client.sync(`http://127.0.0.1:${relayPort}`, hostToken);
  await waitFor(() => Boolean(client.socket));
  const socket = client.socket;
  await client.sync(`http://127.0.0.1:${relayPort}`, hostToken);
  assert.equal(client.socket, socket);
  await client.disconnect();
  await connecting.catch(() => {});
  await close(blackhole);
});

test('relay client reconnects after the host socket drops', async () => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('via-relay');
  });
  const upstreamPort = await listen(upstream);
  const token = generateToken();
  const hostToken = generateToken();
  const gateway = new RemoteGateway();
  await gateway.start({
    port: 0,
    token,
    target: { port: upstreamPort },
  });
  const gatewayPort = gateway.port || gateway.server.address().port;
  gateway.port = gatewayPort;

  const relay = insecureRelay(hostToken);
  const relayPort = await relay.listen(0, '127.0.0.1');
  const client = insecureRelayClient(hostToken, {
    getLocal: () => ({ port: gatewayPort }),
    retryMs: 50,
  });
  try {
    await client.connect(`http://127.0.0.1:${relayPort}`, hostToken);
    assert.equal(client.connected, true);

    client.socket.destroy();
    await waitFor(() => client.connected);

    const allowed = await request(relayPort, '/api/ping', {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body, 'via-relay');
  } finally {
    await client.disconnect();
    await relay.close();
    await gateway.stop();
    await close(upstream);
  }
});

function memoryConfig(initial = {}) {
  let stored = { ...initial };
  return {
    getConfig: () => stored,
    saveConfig: (patch) => {
      stored = { ...stored, ...patch };
      return stored;
    },
  };
}

function cookieFrom(response) {
  const header = String(response.headers.get('set-cookie') || '');
  const match = header.match(/dsh_remote=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

test('QR login mints a long-lived device cookie that survives unbinding of other devices', async () => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('paired');
  });
  const upstreamPort = await listen(upstream);
  const token = generateToken();
  const config = memoryConfig({ remoteToken: token, remoteDevices: [] });
  const gateway = new RemoteGateway(config);
  await gateway.start({ port: 0, token, target: { port: upstreamPort } });
  const port = gateway.port || gateway.server.address().port;

  const login = await request(port, '/__remote__/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    },
    body: `token=${token}`,
    redirect: 'manual',
  });
  assert.equal(login.status, 302);
  const deviceToken = cookieFrom(login);
  assert.ok(deviceToken);
  assert.notEqual(deviceToken, token);
  assert.match(String(login.headers.get('set-cookie') || ''), /Max-Age=/);
  assert.equal(gateway.snapshot().devices.length, 1);
  assert.equal(gateway.snapshot().devices[0].name, 'iPhone');
  assert.equal('token' in gateway.snapshot().devices[0], false);

  const allowed = await request(port, '/api/ping', {
    headers: { cookie: `dsh_remote=${deviceToken}` },
  });
  assert.equal(allowed.status, 200);

  const again = await request(port, '/__remote__/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: `dsh_remote=${deviceToken}`,
    },
    body: `token=${token}`,
    redirect: 'manual',
  });
  assert.equal(cookieFrom(again), deviceToken);
  assert.equal(gateway.snapshot().devices.length, 1);

  const id = gateway.snapshot().devices[0].id;
  assert.equal(gateway.unbindDevice('missing').devices.length, 1);
  gateway.unbindDevice(id);
  assert.equal(gateway.snapshot().devices.length, 0);
  const denied = await request(port, '/api/ping', {
    headers: { cookie: `dsh_remote=${deviceToken}` },
  });
  assert.equal(denied.status, 401);

  await gateway.stop();
  await close(upstream);
});

test('an HTML visit with the pairing cookie upgrades into a bound device', async () => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html>ok</html>');
  });
  const upstreamPort = await listen(upstream);
  const token = generateToken();
  const config = memoryConfig({ remoteToken: token, remoteDevices: [] });
  const gateway = new RemoteGateway(config);
  await gateway.start({ port: 0, token, target: { port: upstreamPort } });
  const port = gateway.port || gateway.server.address().port;

  const upgrade = await request(port, '/', {
    headers: {
      accept: 'text/html',
      cookie: `dsh_remote=${token}`,
      'user-agent': 'Mozilla/5.0 (Linux; Android 14)',
    },
    redirect: 'manual',
  });
  assert.equal(upgrade.status, 302);
  assert.equal(gateway.snapshot().devices.length, 1);
  assert.equal(gateway.snapshot().devices[0].name, 'Android');
  const deviceToken = cookieFrom(upgrade);
  assert.ok(deviceToken);
  assert.notEqual(deviceToken, token);

  await gateway.stop();
  await close(upstream);
});

test('paired HTML comes from the mobile SPA; /api still hits the host', async () => {
  const spaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mobile-web-'));
  fs.writeFileSync(path.join(spaRoot, 'index.html'), '<html>手机远程</html>');
  fs.writeFileSync(path.join(spaRoot, 'app.js'), 'window.DSH_MOBILE=1');
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html>Into the Unknown</html>');
  });
  const upstreamPort = await listen(upstream);
  const token = generateToken();
  const config = memoryConfig({ remoteToken: token, remoteDevices: [] });
  const gateway = new RemoteGateway({ ...config, mobileWebRoot: spaRoot });
  await gateway.start({ port: 0, token, target: { port: upstreamPort } });
  const port = gateway.port || gateway.server.address().port;

  const page = await request(port, '/', { headers: { accept: 'text/html' } });
  assert.equal(page.status, 401);
  assert.match(page.body, /#offer=/);
  assert.doesNotMatch(page.body, /Into the Unknown/);
  assert.doesNotMatch(page.body, /手机远程/);

  const assetDenied = await request(port, '/app.js');
  assert.equal(assetDenied.status, 401);

  const login = await request(port, '/__remote__/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `token=${token}`,
    redirect: 'manual',
  });
  const deviceToken = cookieFrom(login);
  const authed = await request(port, '/', {
    headers: { accept: 'text/html', cookie: `dsh_remote=${deviceToken}` },
  });
  assert.equal(authed.status, 200);
  assert.match(authed.body, /手机远程/);
  assert.doesNotMatch(authed.body, /Into the Unknown/);

  const asset = await request(port, '/app.js', {
    headers: { cookie: `dsh_remote=${deviceToken}` },
  });
  assert.equal(asset.status, 200);
  assert.equal(asset.body, 'window.DSH_MOBILE=1');

  const plugin = await request(port, '/plugins/ui-layout/client.js', {
    headers: { cookie: `dsh_remote=${deviceToken}` },
  });
  assert.equal(plugin.status, 404);

  const api = await request(port, '/api/session.list', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `dsh_remote=${deviceToken}`,
    },
    body: JSON.stringify({ type: 'client-request', rpcId: 'r1', method: 'session.list', payload: {} }),
  });
  assert.equal(api.status, 200);
  assert.equal(api.body, '<html>Into the Unknown</html>');

  await gateway.stop();
  await close(upstream);
  fs.rmSync(spaRoot, { recursive: true, force: true });
});

test('JSON login mints a device token without an HTML body', async () => {
  const upstream = http.createServer((_req, res) => res.end('ok'));
  const upstreamPort = await listen(upstream);
  const token = generateToken();
  const config = memoryConfig({ remoteToken: token, remoteDevices: [] });
  const gateway = new RemoteGateway(config);
  await gateway.start({ port: 0, token, target: { port: upstreamPort } });
  const port = gateway.port || gateway.server.address().port;

  const login = await request(port, '/__remote__/login', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'DshAndroid/1',
    },
    body: JSON.stringify({ token }),
  });
  assert.equal(login.status, 200);
  const json = JSON.parse(login.body);
  assert.equal(json.ok, true);
  assert.ok(json.deviceToken);
  assert.notEqual(json.deviceToken, token);
  assert.match(String(login.headers.get('set-cookie') || ''), /dsh_remote=/);

  const denied = await request(port, '/__remote__/login', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'nope' }),
  });
  assert.equal(denied.status, 401);
  assert.equal(JSON.parse(denied.body).error, '配对密钥无效');
  assert.doesNotMatch(denied.body, /<!DOCTYPE html>/i);

  await gateway.stop();
  await close(upstream);
});

test('proxied API does not forward device authorization to harness', async () => {
  let seenAuth = 'missing';
  let seenCookie = 'missing';
  const upstream = http.createServer((req, res) => {
    seenAuth = req.headers.authorization;
    seenCookie = req.headers.cookie;
    res.end('ok');
  });
  const upstreamPort = await listen(upstream);
  const token = generateToken();
  const gateway = new RemoteGateway();
  await gateway.start({ port: 0, token, target: { port: upstreamPort } });
  const port = gateway.port || gateway.server.address().port;

  const allowed = await request(port, '/api/ping', {
    headers: {
      authorization: `Bearer ${token}`,
      cookie: `dsh_remote=${token}`,
    },
  });
  assert.equal(allowed.status, 200);
  assert.equal(seenAuth, undefined);
  assert.equal(seenCookie, undefined);

  await gateway.stop();
  await close(upstream);
});

test('shell whitelist requires login and rejects unknown names', async () => {
  const upstream = http.createServer((_req, res) => res.end('ok'));
  const upstreamPort = await listen(upstream);
  const token = generateToken();
  const seen = [];
  const gateway = new RemoteGateway({
    invokeShell: async (name, payload) => {
      seen.push({ name, payload });
      return { ok: true, result: { refName: 'main', isRepo: true } };
    },
  });
  await gateway.start({ port: 0, token, target: { port: upstreamPort } });
  const port = gateway.port || gateway.server.address().port;

  const anon = await request(port, '/__remote__/shell/gitStatus', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cwd: '/ws' }),
  });
  assert.equal(anon.status, 401);

  const unknown = await request(port, '/__remote__/shell/writeFile', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ cwd: '/ws', relativePath: 'x' }),
  });
  assert.equal(unknown.status, 404);

  const allowed = await request(port, '/__remote__/shell/gitStatus', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ cwd: '/ws' }),
  });
  assert.equal(allowed.status, 200);
  assert.equal(JSON.parse(allowed.body).result.refName, 'main');
  assert.deepEqual(seen, [{ name: 'gitStatus', payload: { cwd: '/ws' } }]);

  await gateway.stop();
  await close(upstream);
});

