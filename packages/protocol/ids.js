const { toBase64Url, randomBytes } = require('./bytes');

function createPrefixedId(prefix, bytes = 9) {
  return `${prefix}${toBase64Url(randomBytes(bytes))}`;
}

function createServerId() {
  return createPrefixedId('dshd_');
}

function createDeviceId() {
  return createPrefixedId('dev_');
}

function createConnectionId() {
  return createPrefixedId('conn_');
}

function createPairingToken() {
  return toBase64Url(randomBytes(24));
}

function createNonce() {
  return toBase64Url(randomBytes(16));
}

module.exports = {
  createServerId,
  createDeviceId,
  createConnectionId,
  createPairingToken,
  createNonce,
};
