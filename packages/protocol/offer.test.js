const test = require('node:test');
const assert = require('node:assert/strict');
const {
  encodeOffer,
  decodeOffer,
  buildPairingUrl,
  parsePairingFragment,
} = require('./offer');

const sample = {
  v: 2,
  serverId: 'dshd_abcdefghijkl',
  daemonPublicKeyB64: 'daemon-key',
  relayAuthPublicKeyB64: 'relay-key',
  authBootstrap: {
    version: 1,
    pairingToken: 'one-time-token',
    expiresAtMs: 1_700_000_000_000,
  },
  relay: { endpoint: 'relay.example:443', useTls: true },
};

test('round-trips a connection offer through base64url JSON', () => {
  const encoded = encodeOffer(sample);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeOffer(encoded), sample);
});

test('rejects a truncated or non-json offer', () => {
  assert.throws(() => decodeOffer('@@@'), /invalid offer/);
  assert.throws(() => decodeOffer(encodeOffer({ v: 1 })), /unsupported offer/);
});

test('puts the offer in the URL fragment so servers never see the token', () => {
  const url = buildPairingUrl('https://app.example', sample);
  assert.equal(url.startsWith('https://app.example/#'), true);
  assert.match(url, /#offer=/);
  assert.equal(url.includes(sample.authBootstrap.pairingToken), false);
  assert.deepEqual(parsePairingFragment(new URL(url).hash), sample);
});

test('parsePairingFragment ignores a missing offer', () => {
  assert.equal(parsePairingFragment(''), null);
  assert.equal(parsePairingFragment('#other=1'), null);
});
