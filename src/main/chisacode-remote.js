'use strict';

/**
 * ChisaCode remote face — full createChisaCodeDaemon + offer v2 pairing.
 * Replaces HTTP RemoteGateway as the product pairing path (Touching: remote-settings).
 */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { createRequire } = require('module');
const {
  DEFAULT_RELAY_ENDPOINT,
  DEFAULT_RELAY_USE_TLS,
  listLanAddresses,
  preferredLanIp,
  publicUrl,
} = require('../shared/lan');
const { createMobileWebServer, listenMobileWebServer, MOBILE_WEB_PORT } = require('./mobile-web-server');

function resolveVendorRoot() {
  // Packaged: extraResources → resources/vendor/chisacode-remote
  // Dev: repo vendor/chisacode-remote
  try {
    const { app } = require('electron');
    if (app && app.isPackaged) {
      return path.join(process.resourcesPath, 'vendor', 'chisacode-remote');
    }
  } catch {
    // electron unavailable in plain node tests
  }
  return path.join(__dirname, '..', '..', 'vendor', 'chisacode-remote');
}

const VENDOR_ROOT = resolveVendorRoot();
const SERVER_EXPORT = path.join(
  VENDOR_ROOT,
  'packages',
  'server',
  'dist',
  'server',
  'server',
  'exports.js',
);

/**
 * Product Away defaults — always from hardcoded `lan.js` constants so Setup.exe
 * works with zero user config (no reliance on defaults.json surviving the pack).
 */
function readDefaults() {
  return {
    relayEndpoint: DEFAULT_RELAY_ENDPOINT,
    relayUseTls: DEFAULT_RELAY_USE_TLS,
    relayEnabled: true,
    // Documented default origin only — never used as QR SPA landing.
    appBaseUrl: '',
    listen: '127.0.0.1:6767',
  };
}

function resolveVendorRequire() {
  const req = createRequire(path.join(VENDOR_ROOT, 'package.json'));
  return req;
}

/**
 * Load ESM @chisacode/server exports (full daemon API — not a slice).
 * @returns {Promise<typeof import('@chisacode/server')>}
 */
async function loadServerApi() {
  if (!fs.existsSync(SERVER_EXPORT)) {
    throw new Error(
      `ChisaCode server export missing at ${SERVER_EXPORT}. Run vendor sync / build packages/server.`,
    );
  }
  // Ensure workspace junctions resolve before dynamic import.
  resolveVendorRequire();
  return import(pathToFileURL(SERVER_EXPORT).href);
}

function modeIsAway(config) {
  return config.remoteMode === 'relay' || config.remoteMode === 'away';
}

function publicDevicesFromStore(store) {
  if (!store || typeof store.listDevices !== 'function') {
    return [];
  }
  return store.listDevices()
    .filter((device) => !device.revokedAt)
    .map((device) => ({
      id: device.deviceId,
      name: device.label || device.deviceId,
      createdAt: device.createdAt || '',
      boundAt: device.createdAt || '',
      lastSeenAt: device.lastSeenAt || device.createdAt || '',
    }));
}

function logMessageFromArgs(args) {
  if (typeof args[0] === 'string') {
    return args[0];
  }
  if (typeof args[1] === 'string') {
    return args[1];
  }
  return '';
}

function logObjectFromArgs(args) {
  return args[0] && typeof args[0] === 'object' ? args[0] : {};
}

/**
 * Probe relay control state from pino msgs emitted by relay-transport.
 * Zero-fork: startRelayTransport only returns { stop }.
 * @param {import('pino').Logger} logger
 * @param {(state: { connected: boolean, lastError: string }) => void} onStatus
 * @returns {import('pino').Logger}
 */
function attachRelayStatusProbe(logger, onStatus) {
  const probeMessage = (...args) => {
    const msg = logMessageFromArgs(args);
    if (msg === 'relay_control_connected') {
      onStatus({ connected: true, lastError: '' });
      return;
    }
    if (msg === 'relay_error' || msg === 'relay_control_disconnected') {
      const obj = logObjectFromArgs(args);
      const err = obj.err;
      const detail = (err && err.message) || obj.reason || msg;
      onStatus({ connected: false, lastError: String(detail || msg) });
    }
  };

  const wrapLevel = (target, level) => {
    if (target[`__dshRelay${level}`]) {
      return;
    }
    const original = target[level].bind(target);
    const wrapped = (...args) => {
      probeMessage(...args);
      return original(...args);
    };
    wrapped.__dshRelayWrapped = true;
    target[level] = wrapped;
    target[`__dshRelay${level}`] = true;
  };

  const wrapLogger = (target) => {
    for (const level of ['info', 'warn', 'error']) {
      if (typeof target[level] === 'function') {
        wrapLevel(target, level);
      }
    }
    if (typeof target.child === 'function' && !target.__dshRelayChild) {
      const originalChild = target.child.bind(target);
      target.child = (bindings, ...rest) => wrapLogger(originalChild(bindings, ...rest));
      target.__dshRelayChild = true;
    }
    return target;
  };

  return wrapLogger(logger);
}

/**
 * Product remote controller backed by createChisaCodeDaemon.
 */
class ChisaCodeRemote extends EventEmitter {
  /**
   * @param {object} options
   * @param {() => object} options.getConfig
   * @param {(patch: object) => object} options.saveConfig
   * @param {() => string} options.getHomeDir - chisacode home under userData
   * @param {import('electron').SafeStorage | null} [options.safeStorage]
   */
  constructor(options = {}) {
    super();
    this.getConfig = options.getConfig || (() => ({}));
    this.saveConfig = options.saveConfig || (() => ({}));
    this.getHomeDir = options.getHomeDir || (() => path.join(process.cwd(), '.chisacode-home'));
    this.safeStorage = options.safeStorage || null;
    this.daemon = null;
    this.mobileWebServer = null;
    this.serverApi = null;
    this.pairing = { relayEnabled: false, url: null, qr: null };
    this.relayState = { connected: false, lastError: '' };
    this.error = '';
    this.starting = null;
    this._deviceStore = null;
  }

  async ensureApi() {
    if (!this.serverApi) {
      this.serverApi = await loadServerApi();
    }
    return this.serverApi;
  }

  homeDir() {
    const home = this.getHomeDir();
    fs.mkdirSync(home, { recursive: true });
    return home;
  }

  deviceStore() {
    if (this._deviceStore) {
      return this._deviceStore;
    }
    // Lazy require via dynamic path after API load is preferred; fall back to fs store path.
    try {
      const storePath = path.join(
        VENDOR_ROOT,
        'packages',
        'server',
        'dist',
        'server',
        'server',
        'relay-device-credential-store.js',
      );
      if (fs.existsSync(storePath)) {
        const mod = resolveVendorRequire()(storePath);
        const Store = mod.RelayDeviceCredentialStore || mod.default;
        this._deviceStore = new Store(this.homeDir());
        return this._deviceStore;
      }
    } catch {
      // listed after daemon start via API helpers when available
    }
    return null;
  }

  /**
   * Encrypt a device secret for optional desktop-side cache (sticky client material).
   * @param {string} deviceSecret
   * @returns {string | null} base64 ciphertext
   */
  encryptDeviceSecret(deviceSecret) {
    if (!this.safeStorage || typeof this.safeStorage.isEncryptionAvailable !== 'function') {
      return null;
    }
    if (!this.safeStorage.isEncryptionAvailable()) {
      return null;
    }
    if (typeof deviceSecret !== 'string' || deviceSecret.length < 32) {
      throw new Error('Invalid device secret');
    }
    return this.safeStorage.encryptString(deviceSecret).toString('base64');
  }

  setRelayState(next) {
    const connected = Boolean(next && next.connected);
    const lastError = next && next.lastError ? String(next.lastError) : '';
    if (this.relayState.connected === connected && this.relayState.lastError === lastError) {
      return;
    }
    this.relayState = { connected, lastError };
    this.emit('listening', this.snapshot());
  }

  /**
   * QR / SPA landing is always the local mobile/web server — never the relay origin.
   * @returns {string}
   */
  pairingAppBaseUrl() {
    const ip = preferredLanIp() || '127.0.0.1';
    return publicUrl(ip, MOBILE_WEB_PORT).replace(/\/$/, '');
  }

  async ensureMobileWebServer(config = this.getConfig() || {}) {
    if (this.mobileWebServer) {
      return;
    }
    const bind = config.remoteBindAddress === '127.0.0.1' ? '0.0.0.0' : (config.remoteBindAddress || '0.0.0.0');
    const server = createMobileWebServer({ bindAddress: bind, port: MOBILE_WEB_PORT });
    try {
      await listenMobileWebServer(server, bind, MOBILE_WEB_PORT);
    } catch (err) {
      await new Promise((resolve) => {
        server.close(() => { resolve(); });
      });
      const code = err && err.code ? String(err.code) : '';
      if (code === 'EADDRINUSE') {
        throw new Error(`手机配对页端口 ${MOBILE_WEB_PORT} 已被占用，请关闭占用进程或修改 remote 配置后重试`);
      }
      throw err;
    }
    this.mobileWebServer = server;
  }

  async stopMobileWebServer() {
    const server = this.mobileWebServer;
    this.mobileWebServer = null;
    if (!server) {
      return;
    }
    await new Promise((resolve) => {
      server.close(() => { resolve(); });
    });
  }

  snapshot() {
    const config = this.getConfig() || {};
    const defaults = readDefaults();
    const away = modeIsAway(config);
    const enabled = Boolean(config.remoteEnabled);
    const listening = Boolean(this.daemon);
    const store = this.deviceStore();
    const devices = publicDevicesFromStore(store);
    const pairingUrl = this.pairing.url || '';
    const relayEndpoint = (config.remoteRelayEndpoint || config.remoteRelayUrl || defaults.relayEndpoint || '').trim();
    const relayReady = Boolean(relayEndpoint);
    const addresses = listLanAddresses();

    return {
      available: true,
      protocol: 'chisacode-v2',
      enabled,
      listening,
      port: Number(String(defaults.listen || '127.0.0.1:6767').split(':').pop()) || 6767,
      token: '',
      mode: away ? 'relay' : 'lan',
      bindAddress: config.remoteBindAddress || '127.0.0.1',
      lanTls: false,
      tlsFingerprint: '',
      addresses,
      relayUrl: relayEndpoint,
      defaultRelayUrl: defaults.relayEndpoint,
      relayTokenSet: true,
      relayConfigured: relayReady,
      relayConnected: Boolean(this.relayState.connected),
      relayError: this.relayState.lastError || '',
      error: this.error || '',
      target: null,
      devices,
      pairingQr: '',
      urls: pairingUrl
        ? [{ address: preferredLanIp(addresses) || 'pair', url: pairingUrl, pairingUrl }]
        : [],
    };
  }

  async refreshPairing() {
    const api = await this.ensureApi();
    const config = this.getConfig() || {};
    const defaults = readDefaults();
    const relayEndpoint = (config.remoteRelayEndpoint || config.remoteRelayUrl || defaults.relayEndpoint || '').trim();
    const appBaseUrl = this.pairingAppBaseUrl();

    this.pairing = await api.generateLocalPairingOffer({
      chisacodeHome: this.homeDir(),
      relayEnabled: true,
      relayEndpoint,
      relayPublicEndpoint: relayEndpoint,
      relayUseTls: defaults.relayUseTls === true,
      relayPublicUseTls: defaults.relayUseTls === true,
      appBaseUrl,
      includeQr: false,
    });
    return this.pairing;
  }

  async startDaemon() {
    if (this.daemon) {
      await this.refreshPairing();
      return;
    }
    if (this.starting) {
      await this.starting;
      return;
    }

    this.starting = (async () => {
      const api = await this.ensureApi();
      const config = this.getConfig() || {};
      const defaults = readDefaults();
      const home = this.homeDir();
      const relayEndpoint = (config.remoteRelayEndpoint || config.remoteRelayUrl || defaults.relayEndpoint || '').trim();
      const listen = config.remoteListen || defaults.listen || '127.0.0.1:6767';
      const staticDir = path.join(VENDOR_ROOT, 'packages', 'server', 'dist', 'server');
      const agentStoragePath = path.join(home, 'agents');
      fs.mkdirSync(agentStoragePath, { recursive: true });

      await this.ensureMobileWebServer(config);
      this.relayState = { connected: false, lastError: '' };

      const rootLogger = api.createRootLogger(
        { log: { level: 'info', format: 'pretty' } },
        { chisacodeHome: home, file: false },
      );
      const logger = attachRelayStatusProbe(rootLogger, (state) => {
        this.setRelayState(state);
      });

      const daemonConfig = {
        listen,
        chisacodeHome: home,
        corsAllowedOrigins: ['*'],
        staticDir: fs.existsSync(staticDir) ? staticDir : home,
        mcpDebug: false,
        agentClients: {},
        agentStoragePath,
        relayEnabled: true,
        relayEndpoint,
        relayPublicEndpoint: relayEndpoint,
        relayUseTls: defaults.relayUseTls === true,
        relayPublicUseTls: defaults.relayUseTls === true,
        appBaseUrl: this.pairingAppBaseUrl(),
        // Loopback listen: empty auth is allowed. Non-loopback requires a password
        // or CHISACODE_ALLOW_WILDCARD_NO_AUTH=1 (see ChisaCode assertWildcardAuth).
        auth: {},
      };

      // Full daemon — createChisaCodeDaemon, not a hello-only stub.
      this.daemon = await api.createChisaCodeDaemon(daemonConfig, logger);
      await this.daemon.start();
      this._deviceStore = null;
      this.error = '';
      await this.refreshPairing();
      this.emit('listening', this.snapshot());
    })();

    try {
      await this.starting;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.daemon = null;
      this.relayState = { connected: false, lastError: this.error };
      throw err;
    } finally {
      this.starting = null;
    }
  }

  async stopDaemon() {
    this.relayState = { connected: false, lastError: '' };
    if (!this.daemon) {
      this.pairing = { relayEnabled: false, url: null, qr: null };
      await this.stopMobileWebServer();
      return;
    }
    const current = this.daemon;
    this.daemon = null;
    try {
      await current.stop();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
    this.pairing = { relayEnabled: false, url: null, qr: null };
    await this.stopMobileWebServer();
    this.emit('listening', this.snapshot());
  }

  async sync() {
    const config = this.getConfig() || {};
    if (config.remoteEnabled) {
      await this.startDaemon();
    } else {
      await this.stopDaemon();
    }
    return this.snapshot();
  }

  rotateToken() {
    // Offer TTL is re-issued; sticky device secrets stay until unbind.
    return this.refreshPairing().then(() => this.snapshot());
  }

  unbindDevice(id) {
    const store = this.deviceStore();
    if (store && typeof store.revokeDevice === 'function' && id) {
      store.revokeDevice(String(id));
    }
    return this.snapshot();
  }

  ensureToken() {
    return '';
  }
}

module.exports = {
  ChisaCodeRemote,
  loadServerApi,
  VENDOR_ROOT,
  readDefaults,
  attachRelayStatusProbe,
  preferredLanIp,
};
