const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('node:http');
const os = require('os');
const path = require('path');
const { WebSocket } = require('ws');
const { createRelayServer } = require('../../../packages/relay/server');
const {
  generateBoxKeyPair,
  sharedSecret,
  encryptJson,
  decryptJson,
  clientHello,
  hmacProof,
  canonicalDeviceTranscript,
} = require('../../../packages/protocol');
const { createRemoteStore } = require('./store');
const { createOffer } = require('./pairing');
const { createSidecar } = require('./sidecar');

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const inbox = [];
    const waiters = [];
    socket.on('message', (data) => {
      if (waiters.length > 0) waiters.shift()(data);
      else inbox.push(data);
    });
    socket.nextJson = () => new Promise((resolveMsg, rejectMsg) => {
      const timer = setTimeout(() => rejectMsg(new Error('message timeout')), 4000);
      const deliver = (data) => {
        clearTimeout(timer);
        resolveMsg(JSON.parse(String(data)));
      };
      if (inbox.length > 0) deliver(inbox.shift());
      else waiters.push(deliver);
    });
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function listenApi() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      result: { ok: true, value: { items: [{ sessionId: 's1', title: 'office' }] } },
    }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

test('pairs a client through the relay and proxies only allowed RPCs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshd-side-'));
  const store = createRemoteStore(path.join(dir, 'remote-access.json'));
  const relay = createRelayServer({
    knownServerKeys: new Map([[store.get().serverId, store.get().relayAuth.publicKeyB64]]),
  });
  const { port } = await relay.listen(0, '127.0.0.1');
  const api = await listenApi();
  const config = {
    remoteAccessEnabled: true,
    relayEndpoint: `127.0.0.1:${port}`,
    relayUseTls: false,
    remoteAppBaseUrl: 'http://127.0.0.1:8081',
  };
  const sidecar = createSidecar({
    store,
    getConfig: () => config,
    getBaseUrl: () => api.url,
  });
  sidecar.start();
  await new Promise((resolve) => setTimeout(resolve, 80));
  const { offer } = createOffer(store, config);
  const clientKeys = generateBoxKeyPair();
  const client = await openSocket(`ws://127.0.0.1:${port}/ws?serverId=${store.get().serverId}&role=client&v=2`);
  await client.nextJson();
  await new Promise((resolve) => setTimeout(resolve, 80));
  client.send(JSON.stringify(clientHello(clientKeys.publicKeyB64)));
  const ready = await client.nextJson();
  assert.equal(ready.type, 'e2ee_ready');
  const shared = sharedSecret(store.get().e2ee.publicKeyB64, clientKeys.secretKeyB64);
  client.send(JSON.stringify(encryptJson(shared, {
    type: 'hello',
    relayDeviceAuth: { pairingToken: offer.authBootstrap.pairingToken },
  })));
  const hello = decryptJson(shared, await client.nextJson());
  assert.equal(hello.type, 'hello_ok');
  assert.match(hello.deviceId, /^dev_/);

  client.send(JSON.stringify(encryptJson(shared, {
    type: 'http_request',
    id: 'list',
    path: '/api/session.list',
    body: { type: 'client-request', method: 'session.list', payload: {} },
  })));
  const listed = decryptJson(shared, await client.nextJson());
  assert.equal(listed.status, 200);
  assert.equal(listed.body.result.value.items[0].sessionId, 's1');

  client.send(JSON.stringify(encryptJson(shared, {
    type: 'http_request',
    id: 'deny',
    path: '/api/settings.describe',
    body: { type: 'client-request', method: 'settings.describe', payload: {} },
  })));
  const denied = decryptJson(shared, await client.nextJson());
  assert.equal(denied.status, 403);

  const transcript = canonicalDeviceTranscript({
    serverId: store.get().serverId,
    daemonPublicKeyB64: store.get().e2ee.publicKeyB64,
    clientPublicKeyB64: clientKeys.publicKeyB64,
    deviceId: hello.deviceId,
    challenge: ready.authChallenge,
  });
  assert.equal(hmacProof(hello.deviceSecretB64, transcript).length > 10, true);

  sidecar.stop();
  await api.close();
  await relay.close();
});
