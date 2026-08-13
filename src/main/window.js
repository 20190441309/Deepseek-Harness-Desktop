const { BrowserWindow, shell, nativeImage } = require('electron');
const { rendererFile, assetFile, preloadFile } = require('./paths');
const { windowChrome, attachIntegratedChrome, hideNativeMenu, prepareHarnessChrome } = require('./chrome');

let mainWindow = null;
let settingsWindow = null;

function iconImage() {
  const png = nativeImage.createFromPath(assetFile('icon.png'));
  return png.isEmpty() ? undefined : png;
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL();
    const sameApp = url.startsWith('file:') || url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost');
    if (!sameApp && url !== current) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  return mainWindow;
}

function getMainWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function showBoot() {
  const win = createMainWindow();
  return win.loadFile(rendererFile('boot.html'));
}

function showHarness(baseUrl) {
  const win = createMainWindow();
  prepareHarnessChrome(win);
  return win.loadURL(baseUrl);
}

function createSettingsWindow() {
  const parent = getMainWindow();
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    ...windowChrome({
      width: 560,
      height: 920,
      resizable: false,
      minimizable: false,
      maximizable: false,
      parent: parent || undefined,
      modal: Boolean(parent),
      icon: iconImage(),
    }),
    webPreferences: {
      preload: preloadFile(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  hideNativeMenu(settingsWindow);
  attachIntegratedChrome(settingsWindow);
  settingsWindow.loadFile(rendererFile('settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  return settingsWindow;
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
  showBoot,
  showHarness,
  createSettingsWindow,
  sendToBoot,
  iconImage,
};
