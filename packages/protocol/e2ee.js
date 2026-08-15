const nacl = require('tweetnacl');
const { toBase64Url, fromBase64Url } = require('./bytes');

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
  const message = Buffer.from(JSON.stringify(payload), 'utf8');
  const boxed = nacl.secretbox(message, nonce, shared);
  return {
    type: 'e2ee',
    nonce: toBase64Url(nonce),
    ciphertext: toBase64Url(boxed),
  };
}

function decryptJson(shared, frame) {
  if (!frame || frame.type !== 'e2ee') {
    throw new Error('not an e2ee frame');
  }
  const opened = nacl.secretbox.open(
    fromBase64Url(frame.ciphertext),
    fromBase64Url(frame.nonce),
    shared,
  );
  if (!opened) {
    throw new Error('e2ee decrypt failed');
  }
  return JSON.parse(Buffer.from(opened).toString('utf8'));
}

function clientHello(clientPublicKeyB64) {
  return { type: 'e2ee_hello', key: clientPublicKeyB64 };
}

function daemonReady(authChallenge) {
  return { type: 'e2ee_ready', authChallenge };
}

module.exports = {
  generateBoxKeyPair,
  sharedSecret,
  encryptJson,
  decryptJson,
  clientHello,
  daemonReady,
};
