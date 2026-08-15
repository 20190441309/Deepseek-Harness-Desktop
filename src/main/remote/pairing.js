const QRCode = require('qrcode');
const {
  buildPairingUrl,
  createPairingRecord,
  pairingValid,
} = require('../../../packages/protocol');

function createOffer(store, config, now = Date.now()) {
  const pairing = createPairingRecord(now);
  store.setPairing(pairing);
  const state = store.get();
  const publicEndpoint = config.relayPublicEndpoint || config.relayEndpoint || '127.0.0.1:8411';
  const offer = {
    v: 2,
    serverId: state.serverId,
    daemonPublicKeyB64: state.e2ee.publicKeyB64,
    relayAuthPublicKeyB64: state.relayAuth.publicKeyB64,
    authBootstrap: {
      version: 1,
      pairingToken: pairing.pairingToken,
      expiresAtMs: pairing.expiresAtMs,
    },
    relay: {
      endpoint: publicEndpoint,
      useTls: Boolean(config.relayUseTls),
    },
  };
  const pairingUrl = buildPairingUrl(config.remoteAppBaseUrl || 'http://127.0.0.1:8081', offer);
  return { offer, pairing, pairingUrl };
}

async function createOfferWithQr(store, config, now = Date.now()) {
  const created = createOffer(store, config, now);
  const qrDataUrl = await QRCode.toDataURL(created.pairingUrl, { margin: 1, width: 240 });
  return { ...created, qrDataUrl };
}

function consumePairing(store, token, now = Date.now()) {
  const current = store.get().pairing;
  if (!pairingValid(current, token, now)) {
    return false;
  }
  store.setPairing(null);
  return true;
}

module.exports = {
  createOffer,
  createOfferWithQr,
  consumePairing,
};
