const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeOffer, buildPairingUrl } = require('../../../packages/protocol/offer');
const { parseIncomingOffer, relayWsUrl } = require('./offer');

const sample = {
  v: 2,
  serverId: 'dshd_abcdefghijkl',
  daemonPublicKeyB64: 'daemon-key',
  relayAuthPublicKeyB64: 'relay-key',
  authBootstrap: { version: 1, pairingToken: 'one-time-token', expiresAtMs: 1 },
  relay: { endpoint: 'relay.example:443', useTls: true },
};

test('parses a pairing URL fragment and a raw offer', () => {
  const url = buildPairingUrl('https://app.example', sample);
  assert.deepEqual(parseIncomingOffer(url).serverId, sample.serverId);
  assert.deepEqual(parseIncomingOffer(encodeOffer(sample)).relay.endpoint, 'relay.example:443');
  assert.equal(parseIncomingOffer(''), null);
});

test('builds a client relay websocket URL', () => {
  assert.equal(
    relayWsUrl(sample),
    'wss://relay.example:443/ws?serverId=dshd_abcdefghijkl&role=client&v=2',
  );
});
