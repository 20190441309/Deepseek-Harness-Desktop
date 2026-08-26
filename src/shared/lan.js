const os = require('os');
const { encodeOffer } = require('./offer');

/** Product default public relay (HTTP). Only this origin may skip HTTPS. */
const DEFAULT_RELAY_ORIGIN = 'http://125.124.85.212:8411';

function isIpv4(address, family) {
  return family === 'IPv4' || family === 4 || /^\d{1,3}(\.\d{1,3}){3}$/.test(address);
}

function listLanAddresses() {
  const found = [];
  const seen = new Set();
  for (const rows of Object.values(os.networkInterfaces())) {
    for (const row of rows || []) {
      if (!row || row.internal || !row.address || !isIpv4(row.address, row.family)) {
        continue;
      }
      if (seen.has(row.address)) {
        continue;
      }
      seen.add(row.address);
      found.push(row.address);
    }
  }
  return found;
}

/**
 * Normalize a relay origin: HTTPS always; HTTP only for the desktop default relay.
 * @param {string} value - user-entered relay URL.
 * @returns {string} origin or empty string.
 */
function normalizeRelayOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:') {
      return url.origin;
    }
    if (url.protocol === 'http:' && url.origin === DEFAULT_RELAY_ORIGIN) {
      return url.origin;
    }
    return '';
  } catch {
    return '';
  }
}

function pairingUrl(address, port, token, options = {}) {
  const mode = options.mode === 'relay' ? 'relay' : 'lan';
  const relay = normalizeRelayOrigin(options.relay);
  const payload = {
    v: 1,
    token: token || '',
    mode,
  };
  if (mode === 'relay' && relay) {
    payload.relay = relay;
  }
  const tls = mode === 'lan' && options.tls === true;
  if (tls && typeof options.fp === 'string' && options.fp) {
    // Certificate SHA-256 so native clients can pin the self-signed LAN cert.
    payload.fp = options.fp;
  }
  const encoded = encodeOffer(payload);
  if (mode === 'relay' && relay) {
    return `${relay}/#offer=${encoded}`;
  }
  return `${tls ? 'https' : 'http'}://${address}:${Number(port) || 3180}/#offer=${encoded}`;
}

function publicUrl(address, port, options = {}) {
  return `${options.tls === true ? 'https' : 'http'}://${address}:${Number(port) || 3180}/`;
}

/**
 * Addresses the pairing UI may advertise for one bind address:
 * the wildcard exposes every LAN address, loopback only itself, and a
 * specific NIC only that NIC (when it is still present).
 * @param {string} bindAddress - normalized bind address from config.
 * @param {string[]} [addresses] - detected LAN addresses (defaults to a live scan).
 * @returns {string[]} addresses reachable through the current listener.
 */
function reachableAddresses(bindAddress, addresses = listLanAddresses()) {
  const bind = String(bindAddress || '0.0.0.0');
  if (bind === '0.0.0.0') {
    return addresses;
  }
  if (bind === '127.0.0.1') {
    return ['127.0.0.1'];
  }
  return addresses.includes(bind) ? [bind] : [bind];
}

module.exports = {
  DEFAULT_RELAY_ORIGIN,
  listLanAddresses,
  normalizeRelayOrigin,
  pairingUrl,
  publicUrl,
  reachableAddresses,
};
