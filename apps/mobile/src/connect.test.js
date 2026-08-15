const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('node:http');
const os = require('os');
const path = require('path');
const { WebSocket } = require('ws');
const { createRelayServer } = require('../../../packages/relay/server');
const { createRemoteStore } = require('../../../src/main/remote/store');
const { createOffer } = require('../../../src/main/remote/pairing');
const { createSidecar } = require('../../../src/main/remote/sidecar');
const { openRemoteSession } = require('./connect');
const { rpcEnvelope } = require('./fold');

function listenApi() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ result: { ok: true, value: { items: [{ sessionId: 'mob1' }] } } }));
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

test('mobile client pairs through the sidecar and lists sessions', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshd-mob-'));
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
  const session = await openRemoteSession({ offer, WebSocketImpl: WebSocket });
  assert.match(session.device.deviceId, /^dev_/);
  session.send({
    type: 'http_request',
    id: 'list',
    path: '/api/session.list',
    body: rpcEnvelope('session.list', {}),
  });
  const listed = await session.next();
  assert.equal(listed.body.result.value.items[0].sessionId, 'mob1');
  sidecar.stop();
  await api.close();
  await relay.close();
});
