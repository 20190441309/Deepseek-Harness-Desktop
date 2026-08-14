const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { generateToken } = require('../shared/remote-auth');
const { pairingUrl, normalizeRelayOrigin } = require('../shared/lan');
const { encodeOffer, decodeOffer, offerFromHash } = require('../shared/offer');
const { RemoteGateway, rewriteProxyHeaders } = require('./remote');
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

test('pairingUrl puts the token in the hash offer, not the query', () => {
  const url = pairingUrl('10.0.0.4', 3180, 'abc');
  assert.equal(url.startsWith('http://10.0.0.4:3180/'), true);
  assert.equal(url.includes('?token='), false);
  const offer = offerFromHash(new URL(url).hash);
  assert.equal(offer.token, 'abc');
  assert.equal(offer.mode, 'lan');
});

test('pairingUrl for relay uses the relay origin and keeps the secret in the hash', () => {
  const url = pairingUrl('10.0.0.4', 3180, 'abc', { mode: 'relay', relay: 'http://relay.example:8787/path' });
  assert.equal(url.startsWith('http://relay.example:8787/#offer='), true);
  const offer = offerFromHash(new URL(url).hash);
  assert.equal(offer.mode, 'relay');
  assert.equal(offer.relay, 'http://relay.example:8787');
  assert.equal(offer.token, 'abc');
});

test('offer encode/decode round-trips and rejects junk', () => {
  const encoded = encodeOffer({ v: 1, token: 'secret', mode: 'lan' });
  assert.equal(decodeOffer(encoded).token, 'secret');
  assert.equal(decodeOffer('@@@'), null);
  assert.equal(decodeOffer(encodeOffer({ v: 2, token: 'x' })), null);
  assert.equal(normalizeRelayOrigin('ftp://nope'), '');
  assert.equal(normalizeRelayOrigin('not a url'), '');
});

test('gateway refuses to start without a token', async () => {
  const gateway = new RemoteGateway();
  await assert.rejects(() => gateway.start({ port: 0, token: '', target: { port: 1 } }), /令牌/);
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

  const login = await request(port, `/?token=${token}`, { redirect: 'manual' });
  assert.equal(login.status, 302);
  assert.match(String(login.headers.get('set-cookie') || ''), /dsh_remote=/);

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
  const gateway = new RemoteGateway();
  await gateway.start({
    port: 0,
    token,
    target: { port: upstreamPort },
  });
  const gatewayPort = gateway.port || gateway.server.address().port;
  gateway.port = gatewayPort;

  const relay = new RelayServer();
  const relayPort = await relay.listen(0, '127.0.0.1');
  const client = new RelayClient({
    getLocal: () => ({ port: gatewayPort }),
  });
  await client.connect(`http://127.0.0.1:${relayPort}`);
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
  const relay = new RelayServer();
  const relayPort = await relay.listen(0, '127.0.0.1');
  const denied = await request(relayPort, '/');
  assert.equal(denied.status, 503);
  assert.match(denied.body, /桌面还没连上中继/);
  await relay.close();
});

test('relay client reconnects after the host socket drops', async () => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('via-relay');
  });
  const upstreamPort = await listen(upstream);
  const token = generateToken();
  const gateway = new RemoteGateway();
  await gateway.start({
    port: 0,
    token,
    target: { port: upstreamPort },
  });
  const gatewayPort = gateway.port || gateway.server.address().port;
  gateway.port = gatewayPort;

  const relay = new RelayServer();
  const relayPort = await relay.listen(0, '127.0.0.1');
  const client = new RelayClient({
    getLocal: () => ({ port: gatewayPort }),
    retryMs: 50,
  });
  await client.connect(`http://127.0.0.1:${relayPort}`);
  assert.equal(client.connected, true);

  client.socket.destroy();
  await waitFor(() => client.connected);

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

