const nacl = require('tweetnacl');
const { toBase64Url, fromBase64Url, hmacSha256B64 } = require('./bytes');
const { relayWsUrl } = require('./offer');

function generateBoxKeyPair() {
  const pair = nacl.box.keyPair();
  return {
    publicKeyB64: toBase64Url(pair.publicKey),
    secretKeyB64: toBase64Url(pair.secretKey),
  };
}

function sharedSecret(theirPublicKeyB64, ourSecretKeyB64) {
  return nacl.box.before(fromBase64Url(theirPublicKeyB64), fromBase64Url(ourSecretKeyB64));
}

function encryptJson(shared, payload) {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const boxed = nacl.secretbox(new TextEncoder().encode(JSON.stringify(payload)), nonce, shared);
  return { type: 'e2ee', nonce: toBase64Url(nonce), ciphertext: toBase64Url(boxed) };
}

function decryptJson(shared, frame) {
  const opened = nacl.secretbox.open(
    fromBase64Url(frame.ciphertext),
    fromBase64Url(frame.nonce),
    shared,
  );
  if (!opened) {
    throw new Error('e2ee decrypt failed');
  }
  return JSON.parse(new TextDecoder().decode(opened));
}

function canonicalDeviceTranscript(offer, clientPublicKeyB64, deviceId, challenge) {
  return [
    'v=1',
    `serverId=${offer.serverId}`,
    `daemonPublicKeyB64=${offer.daemonPublicKeyB64}`,
    `clientPublicKeyB64=${clientPublicKeyB64}`,
    `deviceId=${deviceId}`,
    `challenge=${challenge}`,
  ].join('\n');
}

async function openRemoteSession({ offer, device, WebSocketImpl }) {
  const Socket = WebSocketImpl || globalThis.WebSocket;
  const keys = generateBoxKeyPair();
  const socket = new Socket(relayWsUrl(offer));
  const shared = sharedSecret(offer.daemonPublicKeyB64, keys.secretKeyB64);
  const inbox = [];
  const waiters = [];

  function onMessage(raw) {
    const data = typeof raw === 'string' || raw instanceof ArrayBuffer ? raw : raw.data;
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    if (waiters.length > 0) waiters.shift()(text);
    else inbox.push(text);
  }

  if (typeof socket.on === 'function') {
    socket.on('message', (data) => onMessage(String(data)));
  } else {
    socket.addEventListener('message', onMessage);
  }

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), 8000);
    const ok = () => {
      clearTimeout(timer);
      resolve();
    };
    if (typeof socket.once === 'function') {
      socket.once('open', ok);
      socket.once('error', () => reject(new Error('connect failed')));
    } else {
      socket.addEventListener('open', ok);
      socket.addEventListener('error', () => reject(new Error('connect failed')));
    }
  });

  function nextRaw() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('message timeout')), 8000);
      const deliver = (text) => {
        clearTimeout(timer);
        resolve(text);
      };
      if (inbox.length > 0) deliver(inbox.shift());
      else waiters.push(deliver);
    });
  }

  await nextRaw();
  socket.send(JSON.stringify({ type: 'e2ee_hello', key: keys.publicKeyB64 }));
  const ready = JSON.parse(await nextRaw());
  if (ready.type !== 'e2ee_ready') {
    throw new Error('missing e2ee_ready');
  }

  const hello = { type: 'hello', relayDeviceAuth: {} };
  if (device?.deviceId && device?.deviceSecretB64) {
    hello.relayDeviceAuth = {
      deviceId: device.deviceId,
      proof: await hmacSha256B64(
        device.deviceSecretB64,
        canonicalDeviceTranscript(offer, keys.publicKeyB64, device.deviceId, ready.authChallenge),
      ),
    };
  } else {
    hello.relayDeviceAuth = { pairingToken: offer.authBootstrap.pairingToken };
  }
  socket.send(JSON.stringify(encryptJson(shared, hello)));
  const welcome = decryptJson(shared, JSON.parse(await nextRaw()));
  if (welcome.type !== 'hello_ok') {
    throw new Error(welcome.message || 'hello rejected');
  }

  return {
    socket,
    shared,
    device: {
      deviceId: welcome.deviceId,
      deviceSecretB64: welcome.deviceSecretB64 || device?.deviceSecretB64,
    },
    send(payload) {
      socket.send(JSON.stringify(encryptJson(shared, payload)));
    },
    async next() {
      return decryptJson(shared, JSON.parse(await nextRaw()));
    },
  };
}

module.exports = {
  generateBoxKeyPair,
  sharedSecret,
  encryptJson,
  decryptJson,
  canonicalDeviceTranscript,
  openRemoteSession,
};
