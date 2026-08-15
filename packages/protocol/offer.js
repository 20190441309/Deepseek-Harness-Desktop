const OFFER_VERSION = 2;

function encodeOffer(offer) {
  if (!offer || offer.v !== OFFER_VERSION) {
    throw new Error('unsupported offer');
  }
  return Buffer.from(JSON.stringify(offer), 'utf8').toString('base64url');
}

function decodeOffer(encoded) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new Error('invalid offer');
  }
  if (!parsed || parsed.v !== OFFER_VERSION) {
    throw new Error('unsupported offer');
  }
  if (typeof parsed.serverId !== 'string' || !parsed.authBootstrap?.pairingToken) {
    throw new Error('invalid offer');
  }
  return parsed;
}

function buildPairingUrl(appBaseUrl, offer) {
  const base = String(appBaseUrl || '').replace(/\/$/, '');
  return `${base}/#offer=${encodeOffer(offer)}`;
}

function parsePairingFragment(hash) {
  const raw = String(hash || '');
  const query = raw.startsWith('#') ? raw.slice(1) : raw;
  const params = new URLSearchParams(query);
  const encoded = params.get('offer');
  if (!encoded) {
    return null;
  }
  return decodeOffer(encoded);
}

module.exports = {
  OFFER_VERSION,
  encodeOffer,
  decodeOffer,
  buildPairingUrl,
  parsePairingFragment,
};
