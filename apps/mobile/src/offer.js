const { fromBase64Url } = require('./bytes');

function decodeOffer(encoded) {
  const json = new TextDecoder().decode(fromBase64Url(encoded));
  const parsed = JSON.parse(json);
  if (!parsed || parsed.v !== 2 || !parsed.serverId || !parsed.authBootstrap?.pairingToken) {
    throw new Error('invalid offer');
  }
  return parsed;
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

function parseIncomingOffer(input) {
  const text = String(input || '').trim();
  if (!text) {
    return null;
  }
  if (text.includes('#offer=') || text.startsWith('#') || text.startsWith('offer=')) {
    const hash = text.includes('#') ? text.slice(text.indexOf('#')) : `#${text}`;
    return parsePairingFragment(hash);
  }
  return decodeOffer(text);
}

function relayWsUrl(offer) {
  const scheme = offer.relay?.useTls ? 'wss' : 'ws';
  return `${scheme}://${offer.relay.endpoint}/ws?serverId=${encodeURIComponent(offer.serverId)}&role=client&v=2`;
}

module.exports = {
  decodeOffer,
  parsePairingFragment,
  parseIncomingOffer,
  relayWsUrl,
};
