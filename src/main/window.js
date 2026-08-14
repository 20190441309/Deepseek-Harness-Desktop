const { BrowserWindow, shell, nativeImage } = require('electron');
const { rendererFile, assetFile, preloadFile } = require('./paths');
const { windowChrome, attachIntegratedChrome, hideNativeMenu, prepareHarnessChrome } = require('./chrome');

let mainWindow = null;

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
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\b/i.test(win?.webContents.getURL() || '');
}

function openHarnessSettings(sectionId) {
  const win = showMain();
  if (!win || !isHarnessLoaded(win)) {
    return Promise.resolve(false);
  }
  const section = JSON.stringify(sectionId || '');
  return win.webContents.executeJavaScript(`
    (() => {
      const trigger = document.querySelector('[data-dsh-settings-trigger]');
      if (!trigger) return false;
      if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
      const id = ${section};
      if (!id) return true;
      return new Promise((resolve) => {
        let n = 0;
        const tick = () => {
          const nav = document.querySelector('[data-dsh-settings-section="' + id + '"]');
          if (nav) {
            nav.click();
            resolve(true);
            return;
          }
          if (n++ > 40) {
            resolve(false);
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      });
    })()
  `).catch(() => false);
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
  showMain,
  openHarnessSettings,
  sendToBoot,
  iconImage,
};
