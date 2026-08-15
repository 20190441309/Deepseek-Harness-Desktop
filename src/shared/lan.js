const os = require('os');
const { encodeOffer } = require('./offer');

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

function normalizeRelayOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }
    return url.origin;
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
  const encoded = encodeOffer(payload);
  if (mode === 'relay' && relay) {
    return `${relay}/#offer=${encoded}`;
  }
  return `http://${address}:${Number(port) || 3180}/#offer=${encoded}`;
}

function publicUrl(address, port) {
  return `http://${address}:${Number(port) || 3180}/`;
}

module.exports = {
  listLanAddresses,
  normalizeRelayOrigin,
  pairingUrl,
  publicUrl,
};
