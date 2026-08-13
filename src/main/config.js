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
  theme: 'midnight',
  locale: 'zh',
  pluginGenUi: true,
  pluginSubagent: true,
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

function defaultWorkspace() {
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
  };
  if (!config.workspace) {
    config.workspace = defaultWorkspace();
  }
  if (config.locale !== 'en' && config.locale !== 'zh') {
    config.locale = DEFAULTS.locale;
  }
  config.pluginGenUi = Boolean(config.pluginGenUi);
  config.pluginSubagent = Boolean(config.pluginSubagent);
  return config;
}

function saveConfig(next) {
  const current = loadConfig();
  const merged = { ...current, ...next };
  merged.locale = merged.locale === 'en' ? 'en' : 'zh';
  merged.pluginGenUi = Boolean(merged.pluginGenUi);
  merged.pluginSubagent = Boolean(merged.pluginSubagent);
  const { apiKey, baseUrl, ...publicConfig } = merged;
  writeJson(configPath(), publicConfig);
  writeJson(credentialsPath(), { apiKey: apiKey || '', baseUrl: baseUrl || '' });
  return merged;
}

function publicConfig(config) {
  return {
    ...config,
    apiKey: config.apiKey ? '********' : '',
    hasApiKey: Boolean(config.apiKey),
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
