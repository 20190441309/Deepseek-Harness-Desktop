const nacl = require('tweetnacl');
const { toBase64Url, fromBase64Url, utf8 } = require('./bytes');

const MAX_AGE_MS = 5 * 60 * 1000;

function generateSignKeyPair() {
  const pair = nacl.sign.keyPair();
  return {
    publicKeyB64: toBase64Url(pair.publicKey),
    secretKeyB64: toBase64Url(pair.secretKey),
  };
}

function canonicalRelayAuth({ serverId, role, connectionId, nonce, issuedAt }) {
  return [
    'v=1',
    `serverId=${serverId}`,
    `role=${role}`,
    `connectionId=${connectionId || ''}`,
    `nonce=${nonce}`,
    `issuedAt=${issuedAt}`,
  ].join('\n');
}

function signRelayAuth(fields, secretKeyB64) {
  const message = utf8(canonicalRelayAuth(fields));
  const signature = nacl.sign.detached(message, fromBase64Url(secretKeyB64));
  return toBase64Url(signature);
}

function verifyRelayAuth(fields, publicKeyB64, signatureB64, now = Date.now(), usedNonces = new Set()) {
  const issuedAt = Number(fields.issuedAt);
  if (!Number.isFinite(issuedAt) || Math.abs(now - issuedAt) > MAX_AGE_MS) {
    return false;
  }
  if (!fields.nonce || usedNonces.has(fields.nonce)) {
    return false;
  }
  const ok = nacl.sign.detached.verify(
    utf8(canonicalRelayAuth(fields)),
    fromBase64Url(signatureB64),
    fromBase64Url(publicKeyB64),
  );
  if (!ok) {
    return false;
  }
  usedNonces.add(fields.nonce);
  return true;
}

function relayQuery(fields, secretKeyB64) {
  const issuedAt = String(fields.issuedAt ?? Date.now());
  const payload = { ...fields, issuedAt };
  return {
    ...payload,
    relayAuthSignatureB64: signRelayAuth(payload, secretKeyB64),
  };
}

module.exports = {
  MAX_AGE_MS,
  generateSignKeyPair,
  canonicalRelayAuth,
  signRelayAuth,
  verifyRelayAuth,
  relayQuery,
};
