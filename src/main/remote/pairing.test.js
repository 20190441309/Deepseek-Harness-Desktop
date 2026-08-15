const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRemoteStore } = require('./store');
const { createOffer, consumePairing } = require('./pairing');
const { parsePairingFragment } = require('../../../packages/protocol');

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshd-pair-'));
  return createRemoteStore(path.join(dir, 'remote-access.json'));
}

test('builds a fragment pairing URL that does not embed the raw token', () => {
  const store = tempStore();
  const { offer, pairingUrl } = createOffer(store, {
    relayEndpoint: 'relay.example:443',
    relayPublicEndpoint: 'relay.example:443',
    relayUseTls: true,
    remoteAppBaseUrl: 'https://app.example',
  });
  assert.equal(pairingUrl.includes(offer.authBootstrap.pairingToken), false);
  assert.deepEqual(parsePairingFragment(new URL(pairingUrl).hash).serverId, store.get().serverId);
});

test('consumes a pairing token once', () => {
  const store = tempStore();
  const { offer } = createOffer(store, { relayEndpoint: '127.0.0.1:8411' });
  assert.equal(consumePairing(store, offer.authBootstrap.pairingToken), true);
  assert.equal(consumePairing(store, offer.authBootstrap.pairingToken), false);
});
