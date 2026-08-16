const { BrowserView, BrowserWindow, shell, nativeImage } = require('electron');
const { rendererFile, assetFile, preloadFile } = require('./paths');
const { windowChrome, attachIntegratedChrome, hideNativeMenu, prepareHarnessChrome, syncHarnessChrome, currentTheme } = require('./chrome');
const { normalizeSettingsSection, buildSettingsSectionScript } = require('./settings-jump');
const {
  isLoopbackHttpUrl,
  isLocalAppNavigationUrl,
  isMarketplaceNavigationUrl,
  isHttpOrHttpsUrl,
  rewriteLoopbackLoadUrl,
  shouldAllowPrivilegedNavigate,
  shouldAllowPrivilegedRedirect,
} = require('./local-url');

const PLUGIN_BOOT_TIMEOUT_MS = 90_000;
const PLUGIN_BOOT_PROBE = `(() => {
  const boot = document.querySelector('[data-dsh-boot-status]');
  const status = boot ? boot.getAttribute('data-dsh-boot-status') : null;
  const hasApp = Boolean(document.querySelector('[data-dsh-settings-trigger], [class*="frame"]'));
  return {
    ready: boot ? Number(boot.getAttribute('data-dsh-boot-ready')) || 0 : 0,
    total: boot ? Number(boot.getAttribute('data-dsh-boot-total')) || 0 : 0,
    pending: !hasApp,
    failed: status === 'failed',
    hasApp,
    error: boot ? String(boot.getAttribute('data-dsh-boot-error') || '') : '',
  };
})()`;

let mainWindow = null;
let marketplaceWindow = null;
let harnessView = null;
let harnessRevealed = false;
let pluginWatchTimer = null;

function iconImage() {
  const png = nativeImage.createFromPath(assetFile('icon.png'));
  if (!png.isEmpty()) {
    return png;
  }
  const svg = nativeImage.createFromPath(assetFile('icon.svg'));
  return svg.isEmpty() ? undefined : svg;
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    ...windowChrome({
      width: 1440,
      height: 920,
      minWidth: 960,
      minHeight: 640,
      show: false,
      icon: iconImage(),
    }),
    webPreferences: {
      preload: preloadFile(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  attachIntegratedChrome(mainWindow);
  mainWindow.once('ready-to-show', () => {
    hideNativeMenu(mainWindow);
    mainWindow.show();
  });
  mainWindow.on('closed', () => {
    hideHarnessView(mainWindow);
    mainWindow = null;
  });

  attachPrivilegedNavigationGuards(mainWindow.webContents, {
    allowUrl: isLocalAppNavigationUrl,
    openDeniedExternal: true,
  });

  return mainWindow;
}

/**
 * Pin a privileged BrowserWindow/BrowserView to an allowlist; denied
 * navigations optionally open http(s) in the system browser.
 * @param {Electron.WebContents} contents
 * @param {{ allowUrl: (url: unknown) => boolean, openDeniedExternal?: boolean }} options
 */
function attachPrivilegedNavigationGuards(contents, options) {
  const { allowUrl, openDeniedExternal = false } = options;
  contents.setWindowOpenHandler(({ url }) => {
    if (isHttpOrHttpsUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    const current = contents.getURL();
    if (!shouldAllowPrivilegedNavigate({ nextUrl: url, currentUrl: current, allowUrl })) {
      event.preventDefault();
      if (openDeniedExternal && isHttpOrHttpsUrl(url)) shell.openExternal(url);
    }
  });
  contents.on('will-redirect', (event, url) => {
    if (!shouldAllowPrivilegedRedirect({ nextUrl: url, allowUrl })) {
      event.preventDefault();
    }
  });
}

function getMainWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function getHarnessWebContents(win) {
  if (!harnessView || harnessView.webContents.isDestroyed()) {
    return null;
  }
  const owner = getMainWindow();
  if (win && owner && win !== owner) {
    return null;
  }
  return harnessView.webContents;
}

function harnessPageContents(win) {
  return getHarnessWebContents(win) || win?.webContents;
}

function sendPluginBoot(payload) {
  sendToBoot('shell:plugin-boot', payload);
}

function hideHarnessView(win) {
  harnessRevealed = false;
  if (pluginWatchTimer) {
    clearTimeout(pluginWatchTimer);
    pluginWatchTimer = null;
  }
  if (!harnessView) {
    return;
  }
  const view = harnessView;
  harnessView = null;
  try {
    win?.removeBrowserView(view);
  } catch {
    // already detached
  }
  if (!view.webContents.isDestroyed()) {
    view.webContents.close();
  }
}

function layoutHarnessView(win) {
  if (!harnessView || !win || win.isDestroyed() || !harnessRevealed) {
    return;
  }
  const bounds = win.getContentBounds();
  harnessView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
  harnessView.setAutoResize({ width: true, height: true });
}

function revealHarnessView(win) {
  if (!harnessView || !win || win.isDestroyed()) {
    return;
  }
  harnessRevealed = true;
  if (!win.getBrowserViews().includes(harnessView)) {
    win.addBrowserView(harnessView);
  }
  layoutHarnessView(win);
  if (typeof win.setTopBrowserView === 'function') {
    win.setTopBrowserView(harnessView);
  }
  prepareHarnessChrome(win);
  syncHarnessChrome(win, harnessView.webContents);
}

function watchPluginBoot(view, win) {
  const deadline = Date.now() + PLUGIN_BOOT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (!view || view.webContents.isDestroyed()) {
        const error = new Error('Web UI 在插件加载期间已关闭');
        error.code = 'HARNESS_OPERATION_CANCELLED';
        reject(error);
        return;
      }
      let status;
      try {
        status = await view.webContents.executeJavaScript(PLUGIN_BOOT_PROBE);
      } catch {
        status = { pending: true, ready: 0, total: 0, failed: false, hasApp: false, error: '' };
      }
      const settled = Boolean(status.hasApp);
      sendPluginBoot({
        ready: status.ready,
        total: status.total,
        pending: Boolean(status.pending) && !settled,
        failed: Boolean(status.failed),
        settled,
        error: status.error || '',
      });
      if (status.failed) {
        reject(new Error(status.error || '插件加载失败'));
        return;
      }
      if (settled || Date.now() > deadline) {
        revealHarnessView(win);
        resolve(status);
        return;
      }
      pluginWatchTimer = setTimeout(tick, 150);
    };
    pluginWatchTimer = setTimeout(tick, 80);
  });
}

function ensureHarnessView(win) {
  if (harnessView && !harnessView.webContents.isDestroyed()) {
    return harnessView;
  }
  hideHarnessView(win);
  harnessView = new BrowserView({
    webPreferences: {
      preload: preloadFile(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.addBrowserView(harnessView);
  harnessView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  attachPrivilegedNavigationGuards(harnessView.webContents, {
    allowUrl: isLoopbackHttpUrl,
    openDeniedExternal: true,
  });
  const applyChrome = () => {
    if (!harnessRevealed || !harnessView || harnessView.webContents.isDestroyed()) {
      return;
    }
    prepareHarnessChrome(win);
    syncHarnessChrome(win, harnessView.webContents);
  };
  harnessView.webContents.on('did-finish-load', applyChrome);
  harnessView.webContents.on('dom-ready', applyChrome);
  harnessView.webContents.on('did-navigate-in-page', applyChrome);
  if (!win._dshHarnessResizeBound) {
    win._dshHarnessResizeBound = true;
    win.on('resize', () => layoutHarnessView(win));
  }
  return harnessView;
}

function showBoot() {
  const win = createMainWindow();
  hideHarnessView(win);
  win.setBackgroundColor(currentTheme().bg);
  if (isBootLoaded(win)) {
    return Promise.resolve();
  }
  return win.loadFile(rendererFile('boot.html'));
}

function showHarness(baseUrl) {
  const loadUrl = rewriteLoopbackLoadUrl(baseUrl);
  if (!loadUrl) {
    return Promise.reject(new Error('Harness URL must be a loopback http(s) address'));
  }
  const win = createMainWindow();
  hideHarnessView(win);
  const bootReady = isBootLoaded(win)
    ? Promise.resolve()
    : win.loadFile(rendererFile('boot.html'));
  return bootReady.then(() => {
    const view = ensureHarnessView(win);
    sendPluginBoot({
      ready: 0,
      total: 0,
      pending: true,
      failed: false,
      settled: false,
      error: '',
    });
    return view.webContents.loadURL(loadUrl).then(() => watchPluginBoot(view, win));
  });
}

function showMain() {
  const win = getMainWindow();
  if (!win) {
    return null;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
  return win;
}

function isHarnessLoaded(win) {
  if (!harnessRevealed) {
    return false;
  }
  const wc = getHarnessWebContents(win);
  return Boolean(wc && isLoopbackHttpUrl(wc.getURL() || ''));
}

function isBootLoaded(win) {
  const url = win?.webContents.getURL() || '';
  return isLocalAppNavigationUrl(url);
}

function openHarnessSettings(sectionId) {
  const requested = normalizeSettingsSection(sectionId);
  if (!requested.ok) {
    return Promise.resolve(false);
  }
  const win = showMain();
  if (!win || !isHarnessLoaded(win)) {
    return Promise.resolve(false);
  }
  return harnessPageContents(win)
    .executeJavaScript(buildSettingsSectionScript(requested.section))
    .catch(() => false);
}

function openMarketplaceWindow() {
  if (marketplaceWindow && !marketplaceWindow.isDestroyed()) {
    if (marketplaceWindow.isMinimized()) {
      marketplaceWindow.restore();
    }
    marketplaceWindow.show();
    marketplaceWindow.focus();
    return marketplaceWindow;
  }

  marketplaceWindow = new BrowserWindow({
    ...windowChrome({
      width: 1120,
      height: 780,
      minWidth: 880,
      minHeight: 600,
      show: false,
      icon: iconImage(),
    }),
    webPreferences: {
      preload: preloadFile(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  attachIntegratedChrome(marketplaceWindow);
  marketplaceWindow.once('ready-to-show', () => {
    hideNativeMenu(marketplaceWindow);
    marketplaceWindow.show();
  });
  marketplaceWindow.on('closed', () => {
    marketplaceWindow = null;
  });
  attachPrivilegedNavigationGuards(marketplaceWindow.webContents, {
    allowUrl: isMarketplaceNavigationUrl,
    openDeniedExternal: true,
  });
  marketplaceWindow.loadFile(rendererFile('marketplace/index.html'));
  return marketplaceWindow;
}

function closeMarketplaceWindow() {
  if (marketplaceWindow && !marketplaceWindow.isDestroyed()) {
    marketplaceWindow.close();
  }
}

function openRemote() {
  return showMain();
}

function openMarketplace() {
  const win = showMain();
  if (!win || !isHarnessLoaded(win)) {
    return openMarketplaceWindow();
  }
  return openHarnessSettings('plugins').then((opened) => {
    if (!opened) {
      return openMarketplaceWindow();
    }
    return harnessPageContents(win).executeJavaScript(`
      (() => {
        return new Promise((resolve) => {
          let n = 0;
          const tick = () => {
            const tab = document.querySelector('[data-dsh-settings-plugin-tab="marketplace"]');
            if (tab) {
              tab.click();
              resolve(true);
              return;
            }
            if (n++ > 60) {
              resolve(false);
              return;
            }
            requestAnimationFrame(tick);
          };
          tick();
        });
      })()
    `).then((selected) => {
      if (!selected) {
        return openMarketplaceWindow();
      }
      return true;
    }).catch(() => openMarketplaceWindow());
  });
}

function sendToBoot(channel, payload) {
  const win = getMainWindow();
  if (!win) {
    return;
  }
  const url = win.webContents.getURL();
  if (url.startsWith('file:') && url.includes('boot.html')) {
    win.webContents.send(channel, payload);
  }
}

module.exports = {
  createMainWindow,
  getMainWindow,
  getHarnessWebContents,
  hideHarnessView,
  showBoot,
  showHarness,
  showMain,
  openHarnessSettings,
  openMarketplace,
  openRemote,
  sendToBoot,
  isBootLoaded,
  isHarnessLoaded,
  iconImage,
  closeMarketplaceWindow,
  attachPrivilegedNavigationGuards,
};
