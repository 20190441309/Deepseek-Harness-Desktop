const { app, dialog, globalShortcut, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { loadConfig, saveConfig } = require('./config');
const { DshManager, ensureOwnedPort } = require('./dsh');
const { HarnessController } = require('./harness-controller');
const { stripDroppedPlugins } = require('./plugins');
const { ensureWorkspace } = require('./workspace-rpc');
const { registerIpc } = require('./ipc');
const { RemoteGateway } = require('./remote');
const { buildMenu } = require('./menu');
const { createTray, showMain } = require('./tray');
const {
  createMainWindow,
  getMainWindow,
  showBoot,
  showHarness,
  sendToBoot,
  isBootLoaded,
} = require('./window');

const dsh = new DshManager();
const remote = new RemoteGateway({
  getTarget: () => (dsh.state === 'ready' && dsh.port ? { port: dsh.port } : null),
  getConfig: loadConfig,
  saveConfig,
});
remote.on('error', (error) => {
  dsh.log(`手机 Remote 错误：${error.message || String(error)}`, 'error');
});
let quitting = false;
let stoppingForQuit = false;

async function resolveLaunchTarget() {
  const config = loadConfig();
  const host = config.host || '127.0.0.1';
  const wanted = Number(config.port) || 3080;
  dsh.log(`检测端口 ${host}:${wanted}`);
  const port = await ensureOwnedPort(host, wanted, (line) => dsh.log(line));
  return { port };
}

const harness = new HarnessController({
  dsh,
  remote,
  loadConfig,
  createMainWindow,
  getMainWindow,
  showBoot,
  showHarness,
  sendToBoot,
  isBootLoaded,
  resolveLaunchTarget,
  stripDroppedPlugins,
  ensureWorkspace,
});

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
  await harness.restart();
  return result.filePaths[0];
}

function quitApp() {
  quitting = true;
  app.quit();
}

function ignoreFailure(promise) {
  Promise.resolve(promise).catch((error) => {
    dsh.log(error.message || String(error), 'error');
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.error('Deepseek-Harness-Desktop is already running. Quit the installed app before npm start (same appId single-instance lock).');
  app.quit();
} else {
  app.on('second-instance', () => {
    showMain();
  });

  app.setName('Deepseek-Harness-Desktop');
  app.setAppUserModelId('ai.deepseek.harness.gui');

  app.whenReady().then(async () => {
    const config = loadConfig();
    fs.mkdirSync(config.workspace, { recursive: true });
    saveConfig({ workspace: config.workspace });
    app.setLoginItemSettings({ openAtLogin: Boolean(config.openAtLogin) });

    registerIpc({ dsh, harness, startHarness: () => harness.restart(), remote });
    buildMenu({
      onOpenWorkspace: () => ignoreFailure(pickWorkspace()),
      onRestart: () => ignoreFailure(harness.restart()),
      onReload: () => ignoreFailure(harness.reload()),
    });
    createTray({
      onRestart: () => ignoreFailure(harness.restart()),
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
      await harness.start();
    } catch {
      // boot page already shows the error
    }
  });

  app.on('activate', () => {
    const win = getMainWindow();
    if (win) {
      win.show();
    } else {
      ignoreFailure(harness.start());
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
    harness.shutdown().finally(() => app.quit());
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !loadConfig().closeToTray) {
      quitApp();
    }
  });
}
