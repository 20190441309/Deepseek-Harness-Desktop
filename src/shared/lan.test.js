'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  preferredLanIp,
  isVirtualOrLinkLocalIpv4,
} = require('./lan');

test('preferredLanIp skips link-local and prefers RFC1918', () => {
  assert.equal(preferredLanIp(['169.254.1.2', '192.168.1.8']), '192.168.1.8');
  assert.equal(preferredLanIp(['100.64.1.2', '10.0.0.4']), '10.0.0.4');
  assert.equal(preferredLanIp(['127.0.0.1', '169.254.9.9']), '');
  assert.equal(preferredLanIp(['8.8.8.8']), '8.8.8.8');
});

test('isVirtualOrLinkLocalIpv4 covers APIPA and CGNAT', () => {
  assert.equal(isVirtualOrLinkLocalIpv4('169.254.10.1'), true);
  assert.equal(isVirtualOrLinkLocalIpv4('100.64.0.1'), true);
  assert.equal(isVirtualOrLinkLocalIpv4('100.127.0.1'), true);
  assert.equal(isVirtualOrLinkLocalIpv4('192.168.0.1'), false);
});
