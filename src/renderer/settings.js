const form = document.getElementById('form');
const messageEl = document.getElementById('message');
const detectedEl = document.getElementById('detected');
const saveEl = document.getElementById('save');

let lastConfig = null;
let lastUpdate = null;
let updateBusy = false;
let updatePercent = 0;

function t(key, vars) {
  return window.I18n ? window.I18n.t(key, vars) : key;
}

function invoke(method, ...args) {
  try {
    const api = window.shell;
    if (!api || typeof api[method] !== 'function') {
      return Promise.reject(new Error(t('apiUnavailable')));
    }
    return Promise.resolve(api[method](...args));
  } catch (error) {
    return Promise.reject(error);
  }
}

function value(id) {
  return document.getElementById(id).value.trim();
}

function setValue(id, next) {
  document.getElementById(id).value = next ?? '';
}

function setChecked(id, next) {
  document.getElementById(id).checked = Boolean(next);
}

function showMessage(text, isError) {
  messageEl.hidden = !text;
  messageEl.textContent = text || '';
  messageEl.className = `message${isError ? ' error' : ''}`;
}

function themeLabel(theme) {
  if (window.I18n) {
    return window.I18n.themeName(theme.id, theme.name);
  }
  return theme.name;
}

function renderThemes(themes, selected) {
  const root = document.getElementById('themes');
  root.replaceChildren();
  for (const theme of themes || []) {
    const name = themeLabel(theme);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.dataset.theme = theme.id;
    button.title = name;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-label', name);
    button.setAttribute('aria-selected', theme.id === selected ? 'true' : 'false');
    button.style.setProperty('--swatch-bg', theme.bg);
    button.style.setProperty('--swatch-accent', theme.accent);
    root.appendChild(button);
  }
}

function renderDetected(config) {
  const bits = [];
  if (config.nodeDetected) {
    bits.push(`Node ${config.nodeDetected}`);
  }
  if (config.dshDetected) {
    bits.push(`dsh ${config.dshDetected}`);
  }
  detectedEl.textContent = bits.join(' · ') || t('detectedNone');
}

function applyLocale(next, config) {
  const locale = window.I18n.setLocale(next);
  if (config || lastConfig) {
    const source = config || lastConfig;
    renderThemes(source.themes, source.theme);
    renderDetected(source);
    renderAbout(source);
  }
  return locale;
}

function updateStatusText() {
  const info = lastUpdate || {};
  if (updateBusy && info.phase === 'download') {
    return t('aboutUpdateDownloading', { percent: String(updatePercent) });
  }
  if (updateBusy && info.phase === 'install') {
    return t('aboutUpdateInstalling');
  }
  if (updateBusy && info.phase === 'checking') {
    return t('aboutUpdateChecking');
  }
  if (info.status === 'none') {
    return t('aboutUpdateNone');
  }
  if (info.status === 'current') {
    return t('aboutUpdateCurrent', { latest: info.latest || info.current || '' });
  }
  if (info.status === 'available') {
    return t('aboutUpdateAvailable', { latest: info.latest || '' });
  }
  if (info.status === 'error') {
    return t('aboutUpdateError', { message: info.message || '' });
  }
  if (info.launched) {
    return t('aboutUpdateInstalling');
  }
  if (info.openedPage) {
    return t('aboutUpdateOpenedPage');
  }
  return '';
}

function renderAbout(config) {
  const source = config || lastConfig || {};
  const versionEl = document.getElementById('about-version');
  const statusEl = document.getElementById('about-update-status');
  const checkEl = document.getElementById('check-update');
  const installEl = document.getElementById('install-update');
  const releasesEl = document.getElementById('about-releases');
  const version = (lastUpdate && lastUpdate.current) || source.appVersion || '—';
  if (versionEl) {
    versionEl.textContent = t('aboutVersion', { version });
  }
  if (statusEl) {
    statusEl.textContent = updateStatusText();
  }
  if (releasesEl) {
    releasesEl.href = (lastUpdate && lastUpdate.releasesUrl) || source.releasesUrl
      || 'https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases';
  }
  if (checkEl) {
    checkEl.disabled = updateBusy;
  }
  if (installEl) {
    const info = lastUpdate || {};
    installEl.disabled = updateBusy || !(info.assetUrl || info.status === 'none' || info.status === 'available' || info.status === 'current');
  }
}

async function hydrate() {
  const config = await invoke('getConfig');
  lastConfig = config;
  applyLocale(config.locale, config);
  setValue('workspace', config.workspace);
  setValue('port', String(config.port || 3080));
  setValue('apiKey', config.apiKey);
  setValue('baseUrl', config.baseUrl);
  setValue('dshBin', config.dshBin);
  setValue('nodeBin', config.nodeBin);
  setChecked('closeToTray', config.closeToTray);
  setChecked('openAtLogin', config.openAtLogin);
  renderAbout(config);
  if (config.themeTokens && window.applyShellTheme) {
    window.applyShellTheme(config.themeTokens);
  }
  checkForUpdate().catch((error) => {
    lastUpdate = { status: 'error', message: error.message || String(error), current: config.appVersion };
    renderAbout(config);
  });
}

async function pickInto(method, id, options) {
  const selected = options
    ? await invoke(method, options)
    : await invoke(method);
  if (selected) {
    setValue(id, selected);
  }
}

document.getElementById('browse-workspace').addEventListener('click', () => {
  pickInto('pickWorkspace', 'workspace').catch((error) => {
    showMessage(error.message || String(error), true);
  });
});

document.getElementById('browse-dsh').addEventListener('click', () => {
  pickInto('pickFile', 'dshBin', { title: t('pickDsh') }).catch((error) => {
    showMessage(error.message || String(error), true);
  });
});

document.getElementById('browse-node').addEventListener('click', () => {
  pickInto('pickFile', 'nodeBin', { title: t('pickNode') }).catch((error) => {
    showMessage(error.message || String(error), true);
  });
});

document.querySelector('.locale-switch').addEventListener('click', (event) => {
  const button = event.target.closest('[data-locale]');
  if (!button) {
    return;
  }
  const locale = applyLocale(button.dataset.locale);
  invoke('saveConfig', { locale }).catch((error) => {
    showMessage(error.message || String(error), true);
  });
});

document.getElementById('themes').addEventListener('click', (event) => {
  const button = event.target.closest('[data-theme]');
  if (!button) {
    return;
  }
  invoke('saveConfig', { theme: button.dataset.theme })
    .then((config) => {
      lastConfig = config;
      renderThemes(config.themes, config.theme);
      if (config.themeTokens && window.applyShellTheme) {
        window.applyShellTheme(config.themeTokens);
      }
      showMessage(t('themeSwitched', { name: button.title }));
    })
    .catch((error) => {
      showMessage(error.message || String(error), true);
    });
});

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href]');
  if (!link || !form.contains(link)) {
    return;
  }
  const href = link.getAttribute('href');
  if (!/^https?:\/\//i.test(href)) {
    return;
  }
  event.preventDefault();
  invoke('openExternal', href).catch((error) => {
    showMessage(error.message || String(error), true);
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveEl.disabled = true;
  showMessage(t('saving'));
  try {
    await invoke('saveConfig', {
      workspace: value('workspace'),
      port: Number(value('port')) || 3080,
      apiKey: document.getElementById('apiKey').value,
      baseUrl: value('baseUrl'),
      dshBin: value('dshBin'),
      nodeBin: value('nodeBin'),
      theme: document.querySelector('.swatch[aria-selected="true"]')?.dataset.theme || 'midnight',
      closeToTray: document.getElementById('closeToTray').checked,
      openAtLogin: document.getElementById('openAtLogin').checked,
      locale: window.I18n ? window.I18n.getLocale() : 'zh',
    });
    await invoke('restart');
    window.close();
  } catch (error) {
    saveEl.disabled = false;
    showMessage(error.message || String(error), true);
  }
});

async function checkForUpdate() {
  updateBusy = true;
  lastUpdate = { ...(lastUpdate || {}), phase: 'checking', current: lastConfig?.appVersion };
  renderAbout();
  try {
    const info = await invoke('checkUpdate');
    lastUpdate = info;
    updateBusy = false;
    renderAbout();
    return info;
  } catch (error) {
    updateBusy = false;
    lastUpdate = { status: 'error', message: error.message || String(error), current: lastConfig?.appVersion };
    renderAbout();
    throw error;
  }
}

async function installLatest() {
  updateBusy = true;
  updatePercent = 0;
  lastUpdate = { ...(lastUpdate || {}), phase: 'download' };
  renderAbout();
  try {
    const info = await invoke('installUpdate');
    lastUpdate = info;
    updateBusy = false;
    renderAbout();
    if (info.launched) {
      showMessage(t('aboutUpdateInstalling'));
    } else if (info.openedPage) {
      showMessage(t('aboutUpdateOpenedPage'));
    }
  } catch (error) {
    updateBusy = false;
    lastUpdate = { status: 'error', message: error.message || String(error), current: lastConfig?.appVersion };
    renderAbout();
    showMessage(error.message || String(error), true);
  }
}

document.getElementById('check-update').addEventListener('click', () => {
  checkForUpdate().catch((error) => {
    showMessage(error.message || String(error), true);
  });
});

document.getElementById('install-update').addEventListener('click', () => {
  installLatest();
});

if (window.shell && typeof window.shell.onUpdateProgress === 'function') {
  window.shell.onUpdateProgress((payload) => {
    if (payload.phase === 'download') {
      updatePercent = Number(payload.percent) || 0;
      lastUpdate = { ...(lastUpdate || {}), phase: 'download' };
    }
    if (payload.phase === 'install') {
      updatePercent = 100;
      lastUpdate = { ...(lastUpdate || {}), phase: 'install' };
    }
    renderAbout();
  });
}

hydrate().catch((error) => {
  showMessage(error.message || String(error), true);
});
if (typeof window.watchShellTheme === 'function') {
  window.watchShellTheme();
}
