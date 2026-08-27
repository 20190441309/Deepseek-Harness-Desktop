import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClientRelayUrl, reconnectSticky } from './session.js';

if (!globalThis.localStorage) {
  const bag = new Map();
  globalThis.localStorage = {
    getItem: (key) => (bag.has(key) ? bag.get(key) : null),
    setItem: (key, value) => { bag.set(key, String(value)); },
    removeItem: (key) => { bag.delete(key); },
  };
}

test('buildClientRelayUrl always passes role=client and useTls===true only', () => {
  const calls = [];
  const api = {
    buildRelayWebSocketUrl(params) {
      calls.push(params);
      const proto = params.useTls ? 'wss' : 'ws';
      return `${proto}://${params.endpoint}/ws?role=${params.role}&serverId=${params.serverId}`;
    },
  };

  const clear = buildClientRelayUrl(api, {
    endpoint: '125.124.85.212:8411',
    useTls: false,
    serverId: 'srv_1',
  });
  assert.equal(calls[0].role, 'client');
  assert.equal(calls[0].useTls, false);
  assert.match(clear, /^ws:\/\//);
  assert.match(clear, /role=client/);

  const tls = buildClientRelayUrl(api, {
    endpoint: 'relay.example.com:443',
    useTls: true,
    serverId: 'srv_2',
  });
  assert.equal(calls[1].role, 'client');
  assert.equal(calls[1].useTls, true);
  assert.match(tls, /^wss:\/\//);
});

test('buildClientRelayUrl treats truthy-but-not-true useTls as false', () => {
  const calls = [];
  const api = {
    buildRelayWebSocketUrl(params) {
      calls.push(params);
      return 'ws://x';
    },
  };
  buildClientRelayUrl(api, { endpoint: 'h:1', useTls: 'yes', serverId: 's' });
  assert.equal(calls[0].useTls, false);
  assert.equal(calls[0].role, 'client');
});

test('reconnectSticky uses role=client and stored useTls', async () => {
  const SECRET_KEY = 'dsh-chisacode-device-secrets';
  localStorage.setItem(SECRET_KEY, JSON.stringify({
    srv_test: {
      deviceId: 'dev_1',
      deviceSecret: 'x'.repeat(64),
      relayEndpoint: '125.124.85.212:8411',
      daemonPublicKeyB64: 'abc',
      useTls: false,
      savedAt: 1,
    },
  }));

  const calls = [];
  class MockDaemonClient {
    constructor(opts) {
      this.opts = opts;
    }

    async connect() {}
  }
  const api = {
    buildRelayWebSocketUrl(params) {
      calls.push(params);
      return 'ws://test/ws';
    },
    DaemonClient: MockDaemonClient,
  };

  await reconnectSticky(api, 'srv_test');

  assert.equal(calls[0].role, 'client');
  assert.equal(calls[0].useTls, false);
  assert.equal(calls[0].serverId, 'srv_test');
});
