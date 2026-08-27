'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ChisaCodeRemote, loadServerApi, readDefaults, VENDOR_ROOT } = require('./chisacode-remote');

// dist/ 是构建产物（vendor 内嵌 .gitignore 挡住了提交），fresh clone / CI 没有。
// 打包机通过 build:server-deps 产出后随 extraResources 发货；这里只在有产物时验证。
const VENDOR_BUILT = fs.existsSync(path.join(VENDOR_ROOT, 'packages', 'server', 'dist', 'server', 'server', 'exports.js'));
const VENDOR_BUILD_HINT = 'vendor/chisacode-remote dist 缺失（npm run build:server-deps && build:server @ vendor/chisacode-remote）';

test('vendor tree includes full daemon sources and AGPL shipping docs', () => {
  assert.ok(fs.existsSync(path.join(VENDOR_ROOT, 'packages', 'server', 'src', 'server', 'exports.ts')));
  assert.ok(fs.existsSync(path.join(VENDOR_ROOT, 'packages', 'relay', 'src', 'cloudflare-adapter.ts')));
  assert.ok(fs.existsSync(path.join(VENDOR_ROOT, 'WORKER-CHECKLIST.md')));
  assert.ok(fs.existsSync(path.join(VENDOR_ROOT, 'AGPL-SHIPPING.md')));
  const { DEFAULT_RELAY_ENDPOINT } = require('../shared/lan');
  assert.equal(DEFAULT_RELAY_ENDPOINT, '125.124.85.212:8411');
  const wrangler = fs.readFileSync(path.join(VENDOR_ROOT, 'packages', 'relay', 'wrangler.toml'), 'utf8');
  assert.doesNotMatch(wrangler, /10ed39a1dbf316e30abd0c409bed40d6/);
  assert.doesNotMatch(wrangler, /chisacode\.sh/);
});

test('built vendor tree includes daemon dist packages (not a hello slice)', { skip: VENDOR_BUILT ? false : VENDOR_BUILD_HINT }, () => {
  assert.ok(fs.existsSync(path.join(VENDOR_ROOT, 'packages', 'server', 'dist', 'server', 'server', 'exports.js')));
  assert.ok(fs.existsSync(path.join(VENDOR_ROOT, 'packages', 'client', 'dist', 'index.js')));
  assert.ok(fs.existsSync(path.join(VENDOR_ROOT, 'packages', 'protocol', 'dist', 'connection-offer.js')));
});

test('defaults bake in desktop Away relay from lan.js constants (packaged path)', () => {
  const defaults = readDefaults();
  assert.equal(defaults.relayEndpoint, '125.124.85.212:8411');
  assert.equal(defaults.appBaseUrl, '');
  assert.equal(defaults.relayUseTls, false);
  const { DEFAULT_RELAY_ENDPOINT, DEFAULT_RELAY_USE_TLS } = require('../shared/lan');
  assert.equal(defaults.relayEndpoint, DEFAULT_RELAY_ENDPOINT);
  assert.equal(defaults.relayUseTls, DEFAULT_RELAY_USE_TLS);
});

test('pairingAppBaseUrl is LAN :3180 never the relay host', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cc-'));
  const remote = new ChisaCodeRemote({
    getConfig: () => ({ remoteEnabled: false, remoteBindAddress: '127.0.0.1' }),
    getHomeDir: () => home,
  });
  const base = remote.pairingAppBaseUrl();
  assert.match(base, /^http:\/\/.+:3180$/);
  assert.doesNotMatch(base, /125\.124\.85\.212/);
});

test('attachRelayStatusProbe flips on relay_control_connected / relay_error', () => {
  const { attachRelayStatusProbe } = require('./chisacode-remote');
  const events = [];
  const makeLeaf = () => ({
    info() {},
    warn() {},
    error() {},
    child() { return makeLeaf(); },
  });
  const logger = attachRelayStatusProbe(makeLeaf(), (s) => events.push(s));
  const child = logger.child({ module: 'relay-transport' });
  child.info({ connectionId: 1 }, 'relay_control_connected');
  child.warn({ err: new Error('Unexpected server response: 401') }, 'relay_error');
  child.info({}, 'relay_control_disconnected');
  assert.equal(events.length, 3);
  assert.equal(events[0].connected, true);
  assert.equal(events[1].connected, false);
  assert.match(events[1].lastError, /401/);
  assert.equal(events[2].connected, false);
  assert.equal(events[2].lastError, 'relay_control_disconnected');
});

test('refreshPairing passes LAN appBaseUrl and includeQr false', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cc-'));
  const calls = [];
  const remote = new ChisaCodeRemote({
    getConfig: () => ({
      remoteEnabled: true,
      remoteMode: 'lan',
      remoteRelayEndpoint: '125.124.85.212:8411',
    }),
    getHomeDir: () => home,
  });
  remote.serverApi = {
    async generateLocalPairingOffer(args) {
      calls.push(args);
      return { relayEnabled: true, url: `${args.appBaseUrl}/#offer=x`, qr: null };
    },
  };
  await remote.refreshPairing();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].includeQr, false);
  assert.match(calls[0].appBaseUrl, /:3180$/);
  assert.doesNotMatch(calls[0].appBaseUrl, /125\.124\.85\.212/);
  assert.equal(calls[0].relayUseTls, false);
});

test('ChisaCodeRemote never uses lan.pairingUrl for product QR', async () => {
  const lan = require('../shared/lan');
  const original = lan.pairingUrl;
  let called = false;
  lan.pairingUrl = (...args) => {
    called = true;
    return original(...args);
  };
  try {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cc-'));
    const remote = new ChisaCodeRemote({
      getConfig: () => ({ remoteEnabled: true, remoteRelayEndpoint: '125.124.85.212:8411' }),
      getHomeDir: () => home,
    });
    remote.serverApi = {
      async generateLocalPairingOffer() {
        return { relayEnabled: true, url: 'http://192.168.1.1:3180/#offer=x', qr: null };
      },
    };
    await remote.refreshPairing();
    assert.equal(called, false);
  } finally {
    lan.pairingUrl = original;
  }
});

test('loadServerApi exposes createChisaCodeDaemon + generateLocalPairingOffer', { skip: VENDOR_BUILT ? false : VENDOR_BUILD_HINT }, async () => {
  const api = await loadServerApi();
  assert.equal(typeof api.createChisaCodeDaemon, 'function');
  assert.equal(typeof api.generateLocalPairingOffer, 'function');
  assert.equal(typeof api.createRootLogger, 'function');
});

test('loadServerApi fails loud with the vendor-build hint when dist is absent', { skip: VENDOR_BUILT ? 'dist 已构建，缺失路径不可达' : false }, async () => {
  await assert.rejects(loadServerApi(), /ChisaCode server export missing/);
});

test('ChisaCodeRemote snapshot is chisacode-v2 and has no host-token wall', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cc-'));
  let config = { remoteEnabled: false, remoteMode: 'lan', remoteRelayEndpoint: 'relay.example.com:443' };
  const remote = new ChisaCodeRemote({
    getConfig: () => config,
    saveConfig: (patch) => { config = { ...config, ...patch }; return config; },
    getHomeDir: () => home,
  });
  const snap = remote.snapshot();
  assert.equal(snap.protocol, 'chisacode-v2');
  assert.equal(snap.relayConfigured, true);
  assert.equal(snap.relayTokenSet, true);
  assert.equal(snap.enabled, false);
});
