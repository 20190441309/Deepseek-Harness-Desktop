const { BrowserWindow, ipcMain, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config');
const { resolveTheme } = require('../shared/themes');

const TITLEBAR_HEIGHT = 48;
const injectScript = fs.readFileSync(path.join(__dirname, 'harness-chrome-inject.js'), 'utf8');
let ipcBound = false;

function currentTheme() {
  return resolveTheme(loadConfig(), {
    systemDark: Boolean(nativeTheme && nativeTheme.shouldUseDarkColors),
  });
}

function windowChrome(overrides = {}) {
  const theme = currentTheme();
  return {
    frame: false,
    roundedCorners: true,
    backgroundColor: theme.bg,
    autoHideMenuBar: true,
    ...overrides,
  };
}

function hideNativeMenu(win) {
  if (!win || win.isDestroyed()) {
    return;
  }
  win.setAutoHideMenuBar(true);
  win.setMenuBarVisibility(false);
}

function isHarnessUrl(url) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\b/i.test(url || '');
}

function paintBackground(win, color) {
  if (!win || win.isDestroyed() || !color) {
    return;
  }
  win.setBackgroundColor(color);
}

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function sendWindowState(win) {
  if (!win || win.isDestroyed()) {
    return;
  }
  win.webContents.send('shell:window-state', {
    maximized: win.isMaximized(),
    minimizable: win.minimizable,
    maximizable: win.maximizable,
  });
}

function bindChromeIpc() {
  if (ipcBound) {
    return;
  }
  ipcBound = true;

  ipcMain.on('shell:window', (event, action) => {
    const win = windowFromEvent(event);
    if (!win || win.isDestroyed()) {
      return;
    }
    if (action === 'minimize' && win.minimizable) {
      win.minimize();
    } else if (action === 'maximize' && win.maximizable) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    } else if (action === 'close') {
      win.close();
    }
  });

  ipcMain.handle('shell:window-state', (event) => {
    const win = windowFromEvent(event);
    if (!win || win.isDestroyed()) {
      return { maximized: false, minimizable: true, maximizable: true };
    }
    return {
      maximized: win.isMaximized(),
      minimizable: win.minimizable,
      maximizable: win.maximizable,
    };
  });

  ipcMain.on('shell:chrome-metrics', (event, metrics) => {
    const win = windowFromEvent(event);
    if (win && metrics?.bg) {
      paintBackground(win, metrics.bg);
    }
  });
}

async function syncHarnessChrome(win) {
  if (win.isDestroyed() || !isHarnessUrl(win.webContents.getURL())) {
    return;
  }
  try {
    const sample = await win.webContents.executeJavaScript(injectScript);
    if (sample?.bg) {
      paintBackground(win, sample.bg);
    }
  } catch {
    paintBackground(win, '#ffffff');
  }
}

function prepareHarnessChrome(win) {
  paintBackground(win, '#ffffff');
}

function applyAppTheme() {
  const theme = currentTheme();
  for (const win of BrowserWindow.getAllWindows()) {
    if (isHarnessUrl(win.webContents.getURL())) {
      syncHarnessChrome(win);
    } else {
      paintBackground(win, theme.bg);
      win.webContents.send('shell:theme', theme);
    }
    sendWindowState(win);
  }
  return theme;
}

function attachIntegratedChrome(win) {
  bindChromeIpc();
  hideNativeMenu(win);
  paintBackground(win, currentTheme().bg);

  const apply = () => {
    if (win.isDestroyed()) {
      return;
    }
    hideNativeMenu(win);
    sendWindowState(win);
    if (isHarnessUrl(win.webContents.getURL())) {
      prepareHarnessChrome(win);
      syncHarnessChrome(win);
      return;
    }
    paintBackground(win, currentTheme().bg);
  };

  win.on('maximize', () => sendWindowState(win));
  win.on('unmaximize', () => sendWindowState(win));
  win.webContents.on('did-finish-load', apply);
  win.webContents.on('dom-ready', apply);
  win.webContents.on('did-navigate-in-page', apply);
}

module.exports = {
  TITLEBAR_HEIGHT,
  windowChrome,
  hideNativeMenu,
  attachIntegratedChrome,
  applyAppTheme,
  prepareHarnessChrome,
  currentTheme,
};
