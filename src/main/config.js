const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { projectRoot } = require('./paths');
const { DEFAULT_CLOSE_TO_TRAY } = require('./close-behavior');
const { normalizeRelayHostToken } = require('../shared/relay-auth');
const { normalizeRemotePatch } = require('./remote-patch');

const REMOTE_FEATURE_ENABLED = true;

const DEFAULTS = {
  workspace: '',
  host: '127.0.0.1',
  port: 3080,
  apiKey: '',
  baseUrl: '',
  dshBin: '',
  nodeBin: '',
  closeToTray: DEFAULT_CLOSE_TO_TRAY,
  openAtLogin: false,
  openDevTools: false,
  theme: 'deepseek',
  locale: 'zh',
  githubToken: '',
  remoteEnabled: false,
  remotePort: 3180,
  remoteToken: '',
  remoteMode: 'lan',
  remoteRelayUrl: '',
  remoteRelayToken: '',
  harnessAutoRestart: true,
  harnessRestartMaxAttempts: 3,
  harnessRestartBaseDelayMs: 1000,
  pluginRecovery: {
    skipUserPlugins: false,
    reason: '',
    at: '',
    appVersion: '',
  },
  quitAfterStart: true,
  autoStartDesktop: true,
  askOnUpdate: true,
  disabledPlugins: [],
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRendererConfigPatch(patch) {
  if (!isPlainObject(patch)) {
    throw new TypeError('Config patch must be an object');
  }
  const next = {};
  for (const [key, value] of Object.entries(patch)) {
    if (['closeToTray', 'openAtLogin', 'openDevTools', 'harnessAutoRestart', 'autoStartDesktop'].includes(key)) {
      if (typeof value !== 'boolean') {
        throw new TypeError(`${key} must be a boolean`);
      }
      next[key] = value;
      continue;
    }
    if (key === 'harnessRestartMaxAttempts') {
      if (!Number.isInteger(value) || value < 1 || value > 10) {
        throw new TypeError(`${key} must be an integer from 1 to 10`);
      }
      next[key] = value;
      continue;
    }
    if (key === 'harnessRestartBaseDelayMs') {
      if (!Number.isInteger(value) || value < 500 || value > 30_000) {
        throw new TypeError(`${key} must be an integer from 500 to 30000`);
      }
      next[key] = value;
      continue;
    }
    if (key === 'locale') {
      if (value !== 'zh' && value !== 'en') {
        throw new TypeError('locale must be zh or en');
      }
      next.locale = value;
      continue;
    }
    if (key === 'theme') {
      if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) {
        throw new TypeError('theme must be a valid theme id');
      }
      next.theme = value;
      continue;
    }
    if (key === 'githubToken') {
      if (typeof value !== 'string' || value.length > 512 || /[\r\n\0]/.test(value)) {
        throw new TypeError('githubToken must be a valid string');
      }
      next.githubToken = value.trim();
      continue;
    }
    throw new Error(`Config field is not renderer-writable: ${key}`);
  }
  return next;
}

function normalizeRelayOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.origin : '';
  } catch {
    return '';
  }
}

function normalizeRemoteConfig(config) {
  const next = { ...config };
  next.remoteEnabled = REMOTE_FEATURE_ENABLED && next.remoteEnabled === true;
  next.remoteRelayUrl = REMOTE_FEATURE_ENABLED ? normalizeRelayOrigin(next.remoteRelayUrl) : '';
  next.remoteRelayToken = normalizeRelayHostToken(next.remoteRelayToken);
  next.remoteMode = REMOTE_FEATURE_ENABLED
    && next.remoteMode === 'relay'
    && next.remoteRelayUrl
    && next.remoteRelayToken
    ? 'relay'
    : 'lan';
  const remotePort = Number(next.remotePort);
  next.remotePort = Number.isInteger(remotePort) && remotePort >= 1024 && remotePort <= 65535
    ? remotePort
    : DEFAULTS.remotePort;
  return next;
}

function normalizeHarnessRecovery(config) {
  const next = { ...config };
  next.harnessAutoRestart = typeof next.harnessAutoRestart === 'boolean'
    ? next.harnessAutoRestart
    : DEFAULTS.harnessAutoRestart;
  const maxAttempts = Number(next.harnessRestartMaxAttempts);
  next.harnessRestartMaxAttempts = Number.isInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= 10
    ? maxAttempts
    : DEFAULTS.harnessRestartMaxAttempts;
  const baseDelayMs = Number(next.harnessRestartBaseDelayMs);
  next.harnessRestartBaseDelayMs = Number.isInteger(baseDelayMs) && baseDelayMs >= 500 && baseDelayMs <= 30_000
    ? baseDelayMs
    : DEFAULTS.harnessRestartBaseDelayMs;
  return next;
}

function normalizePluginRecovery(config) {
  const value = isPlainObject(config.pluginRecovery) ? config.pluginRecovery : {};
  return {
    ...config,
    pluginRecovery: {
      skipUserPlugins: value.skipUserPlugins === true,
      reason: typeof value.reason === 'string' ? value.reason.slice(0, 500) : '',
      at: typeof value.at === 'string' ? value.at.slice(0, 80) : '',
      appVersion: typeof value.appVersion === 'string' ? value.appVersion.slice(0, 80) : '',
    },
  };
}

function normalizeDisabledPlugins(list) {
  return [...new Set((Array.isArray(list) ? list : [])
    .map((name) => String(name || '').trim())
    .filter(Boolean))];
}

function normalizeLauncherSettings(config) {
  return {
    ...config,
    quitAfterStart: config.quitAfterStart !== false,
    autoStartDesktop: config.autoStartDesktop !== false,
    askOnUpdate: config.askOnUpdate !== false,
    disabledPlugins: normalizeDisabledPlugins(config.disabledPlugins),
  };
}

function normalizeLauncherConfigPatch(patch) {
  if (!isPlainObject(patch)) {
    throw new TypeError('Config patch must be an object');
  }
  const next = {};
  for (const [key, value] of Object.entries(patch)) {
    if (['quitAfterStart', 'autoStartDesktop', 'askOnUpdate'].includes(key)) {
      if (typeof value !== 'boolean') {
        throw new TypeError(`${key} must be a boolean`);
      }
      next[key] = value;
      continue;
    }
    throw new Error(`Config field is not launcher-writable: ${key}`);
  }
  return next;
}

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function credentialsPath() {
  return path.join(app.getPath('userData'), 'credentials.json');
}

function readJson(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return { ...fallback };
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function isUnsafeWorkspace(dir) {
  if (!app.isPackaged || !dir) {
    return false;
  }
  const resources = path.normalize(process.resourcesPath);
  const resolved = path.normalize(dir);
  return resolved === resources || resolved.startsWith(`${resources}${path.sep}`);
}

function defaultWorkspace() {
  if (app.isPackaged) {
    return path.join(app.getPath('documents'), 'Deepseek-Harness-Desktop');
  }
  return projectRoot();
}

function loadConfig() {
  const stored = readJson(configPath(), {});
  const creds = readJson(credentialsPath(), {});
  let config = {
    ...DEFAULTS,
    ...stored,
    apiKey: typeof creds.apiKey === 'string' ? creds.apiKey : stored.apiKey || '',
    baseUrl: typeof creds.baseUrl === 'string' ? creds.baseUrl : stored.baseUrl || '',
    githubToken: typeof creds.githubToken === 'string' ? creds.githubToken : stored.githubToken || '',
    remoteToken: typeof creds.remoteToken === 'string' ? creds.remoteToken : stored.remoteToken || '',
    remoteRelayToken: typeof creds.remoteRelayToken === 'string' ? creds.remoteRelayToken : '',
    remoteDevices: Array.isArray(creds.remoteDevices) ? creds.remoteDevices : [],
  };
  config = normalizeLauncherSettings(
    normalizeRemoteConfig(normalizePluginRecovery(normalizeHarnessRecovery(config))),
  );
  if (!config.workspace || isUnsafeWorkspace(config.workspace)) {
    config.workspace = defaultWorkspace();
  }
  if (config.locale !== 'en' && config.locale !== 'zh') {
    config.locale = DEFAULTS.locale;
  }
  delete config.pluginSubagent;
  delete config.pluginGenUi;
  return config;
}

function saveConfig(next) {
  const current = loadConfig();
  const merged = normalizeLauncherSettings(
    normalizeRemoteConfig(normalizePluginRecovery(normalizeHarnessRecovery({ ...current, ...next }))),
  );
  if (merged.githubToken === '********') {
    merged.githubToken = current.githubToken;
  }
  if (merged.apiKey === '********') {
    merged.apiKey = current.apiKey;
  }
  merged.locale = merged.locale === 'en' ? 'en' : 'zh';
  delete merged.pluginSubagent;
  delete merged.pluginGenUi;
  const { apiKey, baseUrl, githubToken, remoteToken, remoteRelayToken, remoteDevices, ...publicLayer } = merged;
  writeJson(configPath(), publicLayer);
  writeJson(credentialsPath(), {
    apiKey: apiKey || '',
    baseUrl: baseUrl || '',
    githubToken: githubToken || '',
    remoteToken: remoteToken || '',
    remoteRelayToken: remoteRelayToken || '',
    remoteDevices: Array.isArray(remoteDevices) ? remoteDevices : [],
  });
  return merged;
}

function publicConfig(config) {
  return {
    ...config,
    apiKey: config.apiKey ? '********' : '',
    githubToken: config.githubToken ? '********' : '',
    hasApiKey: Boolean(config.apiKey),
    hasGithubToken: Boolean(config.githubToken),
    remoteEnabled: Boolean(config.remoteEnabled),
    remoteAvailable: REMOTE_FEATURE_ENABLED,
    remotePort: Number(config.remotePort) || DEFAULTS.remotePort,
    remoteMode: config.remoteMode === 'relay' ? 'relay' : 'lan',
    remoteRelayUrl: config.remoteRelayUrl || '',
    remoteToken: '',
    remoteRelayToken: '',
    remoteDevices: [],
  };
}

function parkRemoteSnapshot(snap) {
  const base = snap && typeof snap === 'object' ? snap : {};
  return {
    ...base,
    available: false,
    enabled: false,
    listening: false,
    urls: [],
    token: '',
  };
}

function readDisabledPlugins(options = {}) {
  if (Array.isArray(options.disabledPlugins)) {
    return options.disabledPlugins;
  }
  try {
    if (!app?.getPath) {
      return [];
    }
    return loadConfig().disabledPlugins || [];
  } catch {
    return [];
  }
}

module.exports = {
  DEFAULTS,
  REMOTE_FEATURE_ENABLED,
  loadConfig,
  saveConfig,
  publicConfig,
  parkRemoteSnapshot,
  defaultWorkspace,
  configPath,
  readDisabledPlugins,
  normalizeHarnessRecovery,
  normalizePluginRecovery,
  normalizeRendererConfigPatch,
  normalizeLauncherConfigPatch,
  normalizeRemotePatch,
  normalizeRelayOrigin,
  normalizeRemoteConfig,
};
