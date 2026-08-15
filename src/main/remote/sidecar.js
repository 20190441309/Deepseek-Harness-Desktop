const { WebSocket } = require('ws');
const {
  createNonce,
  relayQuery,
  daemonReady,
  sharedSecret,
  encryptJson,
  decryptJson,
  canonicalDeviceTranscript,
  issueDevice,
  verifyReturningDevice,
} = require('../../../packages/protocol');
const { consumePairing } = require('./pairing');
const { createApiProxy } = require('./api-proxy');

function relayWsUrl(config, query) {
  const endpoint = config.relayEndpoint || '127.0.0.1:8411';
  const scheme = config.relayUseTls ? 'wss' : 'ws';
  return `${scheme}://${endpoint}/ws?${new URLSearchParams(query).toString()}`;
}

function createSidecar({ store, getConfig, getBaseUrl }) {
  let control = null;
  let reconnectTimer = null;
  const sessions = new Map();
  let connected = false;
  let stopped = true;

  function status() {
    return {
      enabled: Boolean(getConfig().remoteAccessEnabled),
      connected,
      serverId: store.get().serverId,
      deviceCount: store.get().devices.length,
    };
  }

  function sendPlain(socket, payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  function sendCipher(session, payload) {
    sendPlain(session.socket, encryptJson(session.shared, payload));
  }

  function attachDataSocket(connectionId) {
    const config = getConfig();
    const state = store.get();
    const query = relayQuery({
      serverId: state.serverId,
      role: 'server',
      connectionId,
      nonce: createNonce(),
    }, state.relayAuth.secretKeyB64);
    const socket = new WebSocket(relayWsUrl(config, {
      serverId: state.serverId,
      role: 'server',
      v: '2',
      connectionId,
      nonce: query.nonce,
      issuedAt: query.issuedAt,
      relayAuthSignatureB64: query.relayAuthSignatureB64,
    }));
    const session = {
      connectionId,
      socket,
      shared: null,
      clientPublicKeyB64: null,
      challenge: createNonce(),
      authed: false,
      proxy: createApiProxy(getBaseUrl),
    };
    sessions.set(connectionId, session);
    socket.on('message', (raw) => {
      void onDataMessage(session, raw).catch(() => {
        socket.close();
      });
    });
    socket.on('close', () => {
      session.proxy.close();
      sessions.delete(connectionId);
    });
  }

  async function onDataMessage(session, raw) {
    const parsed = JSON.parse(String(raw));
    if (!session.shared) {
      if (parsed.type !== 'e2ee_hello' || !parsed.key) {
        session.socket.close();
        return;
      }
      session.clientPublicKeyB64 = parsed.key;
      session.shared = sharedSecret(parsed.key, store.get().e2ee.secretKeyB64);
      sendPlain(session.socket, daemonReady(session.challenge));
      return;
    }
    const inner = decryptJson(session.shared, parsed);
    if (!session.authed) {
      await authenticate(session, inner);
      return;
    }
    await session.proxy.dispatch(inner, (reply) => sendCipher(session, reply));
  }

  async function authenticate(session, inner) {
    const auth = inner.relayDeviceAuth || {};
    const state = store.get();
    if (auth.pairingToken) {
      if (!consumePairing(store, auth.pairingToken)) {
        sendCipher(session, { type: 'hello_error', message: 'pairing token rejected' });
        session.socket.close();
        return;
      }
      const device = issueDevice();
      store.addDevice(device);
      session.authed = true;
      sendCipher(session, {
        type: 'hello_ok',
        deviceId: device.deviceId,
        deviceSecretB64: device.deviceSecretB64,
      });
      return;
    }
    const device = store.findDevice(auth.deviceId);
    const transcript = canonicalDeviceTranscript({
      serverId: state.serverId,
      daemonPublicKeyB64: state.e2ee.publicKeyB64,
      clientPublicKeyB64: session.clientPublicKeyB64,
      deviceId: auth.deviceId,
      challenge: session.challenge,
    });
    if (!verifyReturningDevice(device, transcript, auth.proof)) {
      sendCipher(session, { type: 'hello_error', message: 'device proof rejected' });
      session.socket.close();
      return;
    }
    session.authed = true;
    sendCipher(session, { type: 'hello_ok', deviceId: device.deviceId });
  }

  function connectControl() {
    const config = getConfig();
    if (!config.remoteAccessEnabled) {
      return;
    }
    const state = store.get();
    const query = relayQuery({
      serverId: state.serverId,
      role: 'server',
      nonce: createNonce(),
    }, state.relayAuth.secretKeyB64);
    const socket = new WebSocket(relayWsUrl(config, {
      serverId: state.serverId,
      role: 'server',
      v: '2',
      nonce: query.nonce,
      issuedAt: query.issuedAt,
      relayAuthSignatureB64: query.relayAuthSignatureB64,
    }));
    control = socket;
    socket.on('open', () => {
      connected = true;
    });
    socket.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'connected' && message.connectionId) {
        attachDataSocket(message.connectionId);
      }
    });
    socket.on('close', () => {
      connected = false;
      if (control === socket) {
        control = null;
      }
      scheduleReconnect();
    });
    socket.on('error', () => {});
  }

  function scheduleReconnect() {
    if (stopped || !getConfig().remoteAccessEnabled || reconnectTimer) {
      return;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectControl();
    }, 1500);
  }

  function start() {
    stop();
    stopped = false;
    if (getConfig().remoteAccessEnabled) {
      connectControl();
    }
  }

  function stop() {
    stopped = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (control) {
      control.close();
      control = null;
    }
    for (const session of sessions.values()) {
      session.proxy.close();
      session.socket.close();
    }
    sessions.clear();
    connected = false;
  }

  return {
    start,
    stop,
    status,
  };
}

module.exports = { createSidecar, relayWsUrl };
