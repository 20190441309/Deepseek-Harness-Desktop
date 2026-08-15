const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRemoteStore } = require('./store');

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshd-remote-'));
  return createRemoteStore(path.join(dir, 'remote-access.json'));
}

test('creates a stable server id and keypairs on first load', () => {
  const store = tempStore();
  const first = store.load();
  assert.match(first.serverId, /^dshd_/);
  assert.ok(first.e2ee.publicKeyB64);
  assert.ok(first.relayAuth.secretKeyB64);
  const second = createRemoteStore(store.path).load();
  assert.equal(second.serverId, first.serverId);
  assert.equal(second.e2ee.secretKeyB64, first.e2ee.secretKeyB64);
});

test('adds and revokes paired devices', () => {
  const store = tempStore();
  store.setPairing({ pairingToken: 'tok', expiresAtMs: Date.now() + 1000 });
  store.addDevice({ deviceId: 'dev_1', deviceSecretB64: 'secret', createdAt: 1 });
  assert.equal(store.get().pairing, null);
  assert.equal(store.findDevice('dev_1').deviceSecretB64, 'secret');
  store.revokeDevice('dev_1');
  assert.equal(store.findDevice('dev_1'), null);
});
