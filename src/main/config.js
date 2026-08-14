const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { projectRoot } = require('./paths');

const DEFAULTS = {
  workspace: '',
  host: '127.0.0.1',
  port: 3080,
  apiKey: '',
  baseUrl: '',
  dshBin: '',
  nodeBin: '',
  closeToTray: true,
  openAtLogin: false,
  openDevTools: false,
  theme: 'deepseek',
  locale: 'zh',
  githubToken: '',
  remoteEnabled: false,
  remotePort: 3180,
  remoteToken: '',
  remoteMode: 'lan',
  remoteRelayUrl: 'http://125.124.85.212:8411',
};

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
  const config = {
    ...DEFAULTS,
    ...stored,
    apiKey: typeof creds.apiKey === 'string' ? creds.apiKey : stored.apiKey || '',
    baseUrl: typeof creds.baseUrl === 'string' ? creds.baseUrl : stored.baseUrl || '',
    githubToken: typeof creds.githubToken === 'string' ? creds.githubToken : stored.githubToken || '',
    remoteToken: typeof creds.remoteToken === 'string' ? creds.remoteToken : stored.remoteToken || '',
    remoteDevices: Array.isArray(creds.remoteDevices) ? creds.remoteDevices : [],
  };
  config.remoteEnabled = Boolean(config.remoteEnabled);
  config.remoteMode = config.remoteMode === 'relay' ? 'relay' : 'lan';
  try {
    const relay = String(config.remoteRelayUrl || '').trim();
    if (!relay) {
      config.remoteRelayUrl = DEFAULTS.remoteRelayUrl;
    } else {
      const url = new URL(relay);
      config.remoteRelayUrl = (url.protocol === 'http:' || url.protocol === 'https:') ? url.origin : '';
    }
  } catch {
    config.remoteRelayUrl = '';
  }
  const remotePort = Number(config.remotePort);
  config.remotePort = Number.isInteger(remotePort) && remotePort >= 1024 && remotePort <= 65535
    ? remotePort
    : DEFAULTS.remotePort;
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
  const merged = { ...current, ...next };
  if (merged.githubToken === '********') {
    merged.githubToken = current.githubToken;
  }
  if (merged.apiKey === '********') {
    merged.apiKey = current.apiKey;
  }
  merged.locale = merged.locale === 'en' ? 'en' : 'zh';
  delete merged.pluginSubagent;
  delete merged.pluginGenUi;
  const { apiKey, baseUrl, githubToken, remoteToken, remoteDevices, ...publicLayer } = merged;
  writeJson(configPath(), publicLayer);
  writeJson(credentialsPath(), {
    apiKey: apiKey || '',
    baseUrl: baseUrl || '',
    githubToken: githubToken || '',
    remoteToken: remoteToken || '',
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
    remotePort: Number(config.remotePort) || DEFAULTS.remotePort,
    remoteMode: config.remoteMode === 'relay' ? 'relay' : 'lan',
    remoteRelayUrl: config.remoteRelayUrl || '',
    remoteToken: '',
    remoteDevices: [],
  };
}

module.exports = {
  DEFAULTS,
  loadConfig,
  saveConfig,
  publicConfig,
  defaultWorkspace,
  configPath,
};
