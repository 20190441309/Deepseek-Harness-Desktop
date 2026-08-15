const test = require('node:test');
const assert = require('node:assert/strict');
const { generateBoxKeyPair, sharedSecret, encryptJson, decryptJson } = require('./e2ee');

test('encrypts a payload that only the peer can read', () => {
  const daemon = generateBoxKeyPair();
  const client = generateBoxKeyPair();
  const toDaemon = sharedSecret(daemon.publicKeyB64, client.secretKeyB64);
  const toClient = sharedSecret(client.publicKeyB64, daemon.secretKeyB64);
  const frame = encryptJson(toDaemon, { hello: 'office' });
  assert.equal(frame.type, 'e2ee');
  assert.deepEqual(decryptJson(toClient, frame), { hello: 'office' });
  const stranger = generateBoxKeyPair();
  assert.throws(
    () => decryptJson(sharedSecret(daemon.publicKeyB64, stranger.secretKeyB64), frame),
    /e2ee decrypt failed/,
  );
});
