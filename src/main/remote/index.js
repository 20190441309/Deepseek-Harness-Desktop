const path = require('path');
const { pairingValid, buildPairingUrl } = require('../../../packages/protocol');
const { createRemoteStore } = require('./store');
const { createOfferWithQr } = require('./pairing');
const { createSidecar } = require('./sidecar');
const QRCode = require('qrcode');

function createRemoteAccess({ userData, loadConfig, getBaseUrl }) {
  const store = createRemoteStore(path.join(userData, 'remote-access.json'));
  const sidecar = createSidecar({
    store,
    getConfig: loadConfig,
    getBaseUrl,
  });

  async function snapshot() {
    const config = loadConfig();
    const state = store.get();
    let pairing = null;
    if (config.remoteAccessEnabled) {
      const current = state.pairing;
      if (current && pairingValid(current, current.pairingToken)) {
        const offer = {
          v: 2,
          serverId: state.serverId,
          daemonPublicKeyB64: state.e2ee.publicKeyB64,
          relayAuthPublicKeyB64: state.relayAuth.publicKeyB64,
          authBootstrap: {
            version: 1,
            pairingToken: current.pairingToken,
            expiresAtMs: current.expiresAtMs,
          },
          relay: {
            endpoint: config.relayPublicEndpoint || config.relayEndpoint || '127.0.0.1:8411',
            useTls: Boolean(config.relayUseTls),
          },
        };
        const pairingUrl = buildPairingUrl(config.remoteAppBaseUrl || 'http://127.0.0.1:8081', offer);
        pairing = {
          pairing: current,
          pairingUrl,
          qrDataUrl: await QRCode.toDataURL(pairingUrl, { margin: 1, width: 240 }),
        };
      } else {
        pairing = await createOfferWithQr(store, config);
      }
    }
    return {
      enabled: Boolean(config.remoteAccessEnabled),
      connected: sidecar.status().connected,
      serverId: state.serverId,
      pairingUrl: pairing?.pairingUrl || null,
      pairingExpiresAtMs: pairing?.pairing.expiresAtMs || null,
      qrDataUrl: pairing?.qrDataUrl || null,
      devices: state.devices.map((device) => ({
        deviceId: device.deviceId,
        createdAt: device.createdAt,
        label: device.label || device.deviceId,
      })),
      relayEndpoint: config.relayPublicEndpoint || config.relayEndpoint || '127.0.0.1:8411',
    };
  }

  return {
    start: () => sidecar.start(),
    stop: () => sidecar.stop(),
    snapshot,
    revokeDevice(deviceId) {
      store.revokeDevice(deviceId);
      return snapshot();
    },
    status: () => sidecar.status(),
  };
}

module.exports = { createRemoteAccess };
