const { app, dialog, globalShortcut, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { loadConfig, saveConfig, defaultWorkspace } = require('./config');
const { DshManager, ensureOwnedPort } = require('./dsh');
const { stripDroppedPlugins } = require('./plugins');
const { ensureWorkspace } = require('./workspace-rpc');
const { registerIpc } = require('./ipc');
const { buildMenu } = require('./menu');
const { createTray, showMain } = require('./tray');
const {
  createMainWindow,
  getMainWindow,
  showBoot,
  showHarness,
  sendToBoot,
} = require('./window');

const dsh = new DshManager();
let quitting = false;
let starting = null;
let stoppingForQuit = false;

dsh.on('state', (snapshot) => sendToBoot('shell:state', snapshot));
dsh.on('log', (line) => sendToBoot('shell:log', line));

async function resolveLaunchTarget() {
  const config = loadConfig();
  const host = config.host || '127.0.0.1';
  const wanted = Number(config.port) || 3080;
  dsh.log(`检测端口 ${host}:${wanted}`);
  const port = await ensureOwnedPort(host, wanted, (line) => dsh.log(line));
  return { port };
}

async function pickWorkspace() {
  const win = getMainWindow();
  const result = await dialog.showOpenDialog(win || undefined, {
    title: '选择工作区',
    defaultPath: loadConfig().workspace,
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  saveConfig({ workspace: result.filePaths[0] });
  await restartHarness();
  return result.filePaths[0];
}

async function startHarness() {
  if (starting) {
    return starting;
  }
  starting = (async () => {
    const win = createMainWindow();
    await showBoot();
    dsh.setState('starting');
    try {
      const target = await resolveLaunchTarget();
      try {
        stripDroppedPlugins();
      } catch (error) {
        dsh.log(`插件清理失败：${error.message}`, 'app');
      }
      const url = await dsh.start(target);
      const { workspace } = loadConfig();
      try {
        await ensureWorkspace(url, workspace);
        dsh.log(`已注册工作区 ${workspace}`);
      } catch (error) {
        dsh.log(`工作区自动注册跳过：${error.message}`, 'app');
      }
      await showHarness(url);
      if (loadConfig().openDevTools) {
        win.webContents.openDevTools({ mode: 'detach' });
      }
      return url;
    } catch (error) {
      dsh.setState('error', { error: error.message });
      dsh.log(error.message, 'error');
      throw error;
    } finally {
      starting = null;
    }
  })();
  return starting;
}

async function restartHarness() {
  await dsh.stop();
  return startHarness();
}

function reloadUi() {
  const win = getMainWindow();
  if (!win) {
    return;
  }
  if (dsh.state === 'ready' && dsh.baseUrl) {
    win.loadURL(dsh.baseUrl);
    return;
  }
  startHarness().catch(() => {});
}

function quitApp() {
  quitting = true;
  app.quit();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMain();
  });

  app.setName('Deepseek-Harness-Desktop');
  app.setAppUserModelId('ai.deepseek.harness.gui');

  app.whenReady().then(async () => {
    const config = loadConfig();
    if (!fs.existsSync(config.workspace)) {
      saveConfig({ workspace: defaultWorkspace() });
    }
    app.setLoginItemSettings({ openAtLogin: Boolean(config.openAtLogin) });

    registerIpc({ dsh, startHarness: restartHarness });
    buildMenu({
      onOpenWorkspace: () => pickWorkspace(),
      onRestart: () => restartHarness(),
      onReload: () => reloadUi(),
    });
    createTray({
      onRestart: () => restartHarness(),
      onQuit: () => quitApp(),
    });

    const win = createMainWindow();
    win.on('close', (event) => {
      if (!quitting && loadConfig().closeToTray) {
        event.preventDefault();
        win.hide();
      }
    });

    session.defaultSession.on('will-download', (event, item) => {
      const fileName = item.getFilename();
      const dest = path.join(app.getPath('downloads'), fileName);
      item.setSavePath(dest);
    });

    globalShortcut.register('CommandOrControl+Shift+I', () => {
      getMainWindow()?.webContents.toggleDevTools();
    });

    try {
      await startHarness();
    } catch {
      // boot page already shows the error
    }
  });

  app.on('activate', () => {
    const win = getMainWindow();
    if (win) {
      win.show();
    } else {
      startHarness().catch(() => {});
    }
  });

  app.on('before-quit', (event) => {
    quitting = true;
    globalShortcut.unregisterAll();
    if (stoppingForQuit) {
      return;
    }
    event.preventDefault();
    stoppingForQuit = true;
    dsh.stop().finally(() => app.quit());
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !loadConfig().closeToTray) {
      quitApp();
    }
  });
}
