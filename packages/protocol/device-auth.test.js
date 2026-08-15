const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PAIRING_TTL_MS,
  canonicalDeviceTranscript,
  hmacProof,
  createPairingRecord,
  pairingValid,
  issueDevice,
  verifyReturningDevice,
} = require('./device-auth');

const transcript = canonicalDeviceTranscript({
  serverId: 'dshd_abc',
  daemonPublicKeyB64: 'daemon',
  clientPublicKeyB64: 'client',
  deviceId: 'dev_1',
  challenge: 'challenge',
});

test('accepts a live pairing token and rejects an expired one', () => {
  const now = 1_700_000_000_000;
  const record = createPairingRecord(now);
  assert.equal(pairingValid(record, record.pairingToken, now + 1000), true);
  assert.equal(pairingValid(record, 'wrong', now + 1000), false);
  assert.equal(pairingValid(record, record.pairingToken, now + PAIRING_TTL_MS + 1), false);
});

test('issues a device secret that later visits can prove', () => {
  const device = issueDevice();
  const proof = hmacProof(device.deviceSecretB64, transcript);
  assert.equal(verifyReturningDevice(device, transcript, proof), true);
  assert.equal(verifyReturningDevice(device, transcript, 'nope'), false);
  assert.equal(verifyReturningDevice(null, transcript, proof), false);
});
