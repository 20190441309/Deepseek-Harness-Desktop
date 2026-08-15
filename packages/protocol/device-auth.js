const { createHmac, timingSafeEqual } = require('node:crypto');
const { toBase64Url, fromBase64Url, utf8, randomBytes } = require('./bytes');
const { createDeviceId, createPairingToken } = require('./ids');

const PAIRING_TTL_MS = 10 * 60 * 1000;

function canonicalDeviceTranscript({
  serverId,
  daemonPublicKeyB64,
  clientPublicKeyB64,
  deviceId,
  challenge,
}) {
  return [
    'v=1',
    `serverId=${serverId}`,
    `daemonPublicKeyB64=${daemonPublicKeyB64}`,
    `clientPublicKeyB64=${clientPublicKeyB64}`,
    `deviceId=${deviceId}`,
    `challenge=${challenge}`,
  ].join('\n');
}

function hmacProof(deviceSecretB64, transcript) {
  return createHmac('sha256', Buffer.from(fromBase64Url(deviceSecretB64)))
    .update(utf8(transcript))
    .digest('base64url');
}

function proofsEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function createPairingRecord(now = Date.now()) {
  return {
    pairingToken: createPairingToken(),
    expiresAtMs: now + PAIRING_TTL_MS,
  };
}

function pairingValid(record, token, now = Date.now()) {
  return Boolean(
    record
    && record.pairingToken
    && record.pairingToken === token
    && Number(record.expiresAtMs) > now,
  );
}

function issueDevice(now = Date.now()) {
  return {
    deviceId: createDeviceId(),
    deviceSecretB64: toBase64Url(randomBytes(32)),
    createdAt: now,
  };
}

function verifyReturningDevice(device, transcript, proof) {
  if (!device?.deviceSecretB64) {
    return false;
  }
  return proofsEqual(hmacProof(device.deviceSecretB64, transcript), proof);
}

module.exports = {
  PAIRING_TTL_MS,
  canonicalDeviceTranscript,
  hmacProof,
  proofsEqual,
  createPairingRecord,
  pairingValid,
  issueDevice,
  verifyReturningDevice,
};
