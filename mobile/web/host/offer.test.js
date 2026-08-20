import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeOffer, offerFromHash, offerFromPaste } from './offer.js';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

test('decodeOffer reads v1 lan and relay payloads', () => {
  const lan = decodeOffer(b64url({ v: 1, token: 'secret-token', mode: 'lan' }));
  assert.equal(lan.token, 'secret-token');
  assert.equal(lan.mode, 'lan');
  const relay = decodeOffer(b64url({
    v: 1, token: 'secret-token', mode: 'relay', relay: 'https://relay.example',
  }));
  assert.equal(relay.mode, 'relay');
  assert.equal(relay.relay, 'https://relay.example');
});

test('offerFromHash reads #offer= and ignores query', () => {
  const raw = b64url({ v: 1, token: 'abc', mode: 'lan' });
  assert.equal(offerFromHash(`#offer=${raw}`).token, 'abc');
  assert.equal(offerFromHash(`?token=leaked#offer=${raw}`).token, 'abc');
  assert.equal(offerFromHash('#nope=1'), null);
  assert.equal(decodeOffer('%%%'), null);
});

test('offerFromPaste reads a full URL, a hash, or offer= payload', () => {
  const raw = b64url({ v: 1, token: 'paste-token', mode: 'lan' });
  assert.equal(offerFromPaste(`https://relay.example/#offer=${raw}`).token, 'paste-token');
  assert.equal(offerFromPaste(`#offer=${raw}`).token, 'paste-token');
  assert.equal(offerFromPaste(`offer=${raw}`).token, 'paste-token');
  assert.equal(offerFromPaste('https://relay.example/'), null);
});
