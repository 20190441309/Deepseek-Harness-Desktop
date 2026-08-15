const { app, dialog, globalShortcut, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { loadConfig, saveConfig } = require('./config');
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
const { showClosingOverlay } = require('./closing-overlay');
const { hideOnClose } = require('./close-behavior');
const { createRemoteAccess } = require('./remote');

const dsh = new DshManager();
let remoteAccess = null;
let desktopResources = null;
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
      if (process.env.DSH_SMOKE === '1') {
        void runSmoke(win);
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
  cleanupDesktopResources();
  await dsh.stop();
  return startHarness();
}

/** Tear down desktop-bound child processes and views (PTY, BrowserView). */
function cleanupDesktopResources() {
  if (!desktopResources) {
    return;
  }
  try {
    desktopResources.pty.killAll();
  } catch (error) {
    dsh.log(`PTY 清理失败：${error.message}`, 'app');
  }
  void Promise.resolve(desktopResources.preview.closeAll()).catch((error) => {
    dsh.log(`预览清理失败：${error.message}`, 'app');
  });
}

/** One-shot launch smoke: report the assembled chrome and exit with its status. */
async function runSmoke(win) {
  const pageErrors = [];
  const onError = (_event, error) => { pageErrors.push(String(error).slice(0, 500)); };
  win.webContents.on('render-process-gone', (_event, details) => {
    pageErrors.push(`render-process-gone: ${details.reason}`);
  });
  win.webContents.on('console-message', (_event, _level, message) => {
    if (String(message).includes('Uncaught')) pageErrors.push(String(message).slice(0, 500));
  });
  win.webContents.on('did-fail-load', onError);
  try {
    const result = await win.webContents.executeJavaScript(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 60 && !document.querySelector('[class*="frame"]'); i += 1) await sleep(250);
      await sleep(2500);
      const frame = document.querySelector('[class*="frame"]');
      const titlebar = document.querySelector('#dsh-shell-titlebar-trailing');
      const buttons = titlebar ? Array.from(titlebar.querySelectorAll('button')).map(b => (b.getAttribute('aria-label') || b.textContent || '').trim()) : [];
      return {
        hasFrame: Boolean(frame),
        gridColumns: frame ? getComputedStyle(frame).gridTemplateColumns : null,
        hasTitlebar: Boolean(titlebar),
        titlebarButtons: buttons,
        hasSessionLog: buttons.some(t => t.includes('Session log')),
      };
    })()`);
    console.log('[DSH_SMOKE]', JSON.stringify({ ...result, pageErrors }));
    // Real PTY probe: node-pty is the one native dependency; prove it can
    // spawn a shell inside Electron (or report the exact failure) so the
    // smoke distinguishes "UI renders" from "terminal backend actually works".
    let ptyStatus = 'skipped';
    try {
      const created = await Promise.race([
        desktopResources.pty.create({ cwd: loadConfig().workspace, cols: 80, rows: 24 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('pty-create timed out')), 15000)),
      ]);
      ptyStatus = `created:${created.id}`;
      await Promise.race([
        (async () => {
          await desktopResources.pty.write(created.id, 'echo dsh-smoke-ok\r');
          await new Promise((resolve) => setTimeout(resolve, 800));
          await desktopResources.pty.kill(created.id);
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('pty-roundtrip timed out')), 20000)),
      ]);
      ptyStatus = 'echoed:ok';
    } catch (error) {
      ptyStatus = `unavailable:${error.message}`;
    }
    console.log('[DSH_SMOKE_PTY]', ptyStatus);
    const ok = result.hasFrame && result.hasTitlebar && result.hasSessionLog && pageErrors.length === 0;
    try {
      const fs = require('node:fs');
      fs.writeFileSync(path.join(app.getPath('userData'), 'dsh-smoke.json'), JSON.stringify({ ok, result, ptyStatus, pageErrors }, null, 2));
    } catch {
      // Best-effort: the exit code still carries the verdict.
    }
    app.exit(ok ? 0 : 1);
  } catch (error) {
    console.log('[DSH_SMOKE] failed', String(error));
    app.exit(1);
  }
}

function reloadUi() {
  const win = getMainWindow();
  if (!win) {
    return;
  }
  cleanupDesktopResources();
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
    fs.mkdirSync(config.workspace, { recursive: true });
    saveConfig({ workspace: config.workspace });
    app.setLoginItemSettings({ openAtLogin: Boolean(config.openAtLogin) });

    remoteAccess = createRemoteAccess({
      userData: app.getPath('userData'),
      loadConfig,
      getBaseUrl: () => dsh.baseUrl,
    });
    desktopResources = registerIpc({ dsh, startHarness: restartHarness, remoteAccess });
    if (loadConfig().remoteAccessEnabled) {
      remoteAccess.start();
    }
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
      if (quitting) {
        return;
      }
      if (hideOnClose(loadConfig(), quitting)) {
        event.preventDefault();
        win.hide();
        return;
      }
      event.preventDefault();
      quitApp();
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
    cleanupDesktopResources();
    if (remoteAccess) {
      remoteAccess.stop();
    }
    showClosingOverlay(getMainWindow(), loadConfig().locale)
      .catch(() => {})
      .then(() => dsh.stop())
      .finally(() => app.quit());
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !hideOnClose(loadConfig())) {
      quitApp();
    }
  });
}
