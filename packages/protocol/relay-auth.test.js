const test = require('node:test');
const assert = require('node:assert/strict');
const { generateSignKeyPair, relayQuery, verifyRelayAuth } = require('./relay-auth');

test('accepts a fresh signed relay handshake and rejects replay', () => {
  const keys = generateSignKeyPair();
  const used = new Set();
  const query = relayQuery({
    serverId: 'dshd_abc',
    role: 'server',
    connectionId: '',
    nonce: 'nonce-1',
  }, keys.secretKeyB64);
  assert.equal(verifyRelayAuth(query, keys.publicKeyB64, query.relayAuthSignatureB64, Date.now(), used), true);
  assert.equal(verifyRelayAuth(query, keys.publicKeyB64, query.relayAuthSignatureB64, Date.now(), used), false);
});

test('rejects an expired or wrong-key signature', () => {
  const keys = generateSignKeyPair();
  const other = generateSignKeyPair();
  const query = relayQuery({
    serverId: 'dshd_abc',
    role: 'server',
    nonce: 'nonce-2',
    issuedAt: Date.now() - 10 * 60 * 1000,
  }, keys.secretKeyB64);
  assert.equal(verifyRelayAuth(query, keys.publicKeyB64, query.relayAuthSignatureB64), false);
  const fresh = relayQuery({
    serverId: 'dshd_abc',
    role: 'server',
    nonce: 'nonce-3',
  }, keys.secretKeyB64);
  assert.equal(verifyRelayAuth(fresh, other.publicKeyB64, fresh.relayAuthSignatureB64), false);
});
