const { ipcMain, dialog, app, shell, nativeTheme } = require('electron');
const { loadConfig, saveConfig, publicConfig } = require('./config');
const { getMainWindow, openHarnessSettings, openMarketplace } = require('./window');
const { resolveNodeBin, resolveDshBin, sourceHarnessStatus } = require('./dsh');
const { listThemes, resolveTheme } = require('../shared/themes');
const { applyAppTheme } = require('./chrome');
const { checkUpdate, installUpdate, currentVersion, REPO_URL, RELEASES_PAGE } = require('./update');
const { listMarketplace } = require('./marketplace-catalog');
const { listInstalledPlugins, installPlugin, uninstallPlugin } = require('./marketplace-install');
const { gitCommit, gitCreateChangeRequest, gitDiff, gitPull, gitPush, gitStatus } = require('./git');
const { registerPtyIpc } = require('./pty');
const { registerPreviewIpc } = require('./preview');
const { listDir, readFile } = require('./workspace-fs');

function configLocale(config = loadConfig()) {
  return config.locale === 'en' ? 'en' : 'zh';
}

function configPayload(config) {
  return {
    ...publicConfig(config),
    apiKey: config.apiKey,
    locale: configLocale(config),
    theme: config.theme || 'midnight',
    themes: listThemes(),
    themeTokens: resolveTheme(config, {
      systemDark: Boolean(nativeTheme && nativeTheme.shouldUseDarkColors),
    }),
    nodeDetected: resolveNodeBin(config),
    dshDetected: (() => {
      const source = sourceHarnessStatus();
      if (source.present) {
        return source.built ? `源码 ${source.root}` : `源码未构建 ${source.root}`;
      }
      return resolveDshBin(config);
    })(),
    appVersion: currentVersion(),
    repoUrl: REPO_URL,
    releasesUrl: RELEASES_PAGE,
  };
}

function sendPluginProgress(event, payload) {
  if (event?.sender && !event.sender.isDestroyed()) {
    event.sender.send('shell:plugin-progress', payload);
  }
}

function registerIpc({ dsh, startHarness, remoteAccess }) {
  ipcMain.handle('shell:get-state', () => dsh.snapshot());

  ipcMain.handle('shell:get-config', () => configPayload(loadConfig()));

  ipcMain.handle('shell:save-config', async (_event, patch) => {
    const next = saveConfig(patch || {});
    app.setLoginItemSettings({ openAtLogin: Boolean(next.openAtLogin) });
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'theme')) {
      applyAppTheme();
    }
    return configPayload(next);
  });

  ipcMain.handle('shell:open-external', async (_event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Invalid URL');
    }
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle('shell:pick-workspace', async () => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win || undefined, {
      title: configLocale() === 'en' ? 'Choose workspace' : '选择工作区',
      defaultPath: loadConfig().workspace,
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('shell:restart', async () => {
    await startHarness();
    return dsh.snapshot();
  });

  ipcMain.handle('shell:open-settings', () => openHarnessSettings());

  ipcMain.handle('shell:check-update', () => checkUpdate());

  ipcMain.handle('shell:list-marketplace', async (_event, options = {}) => {
    const config = loadConfig();
    return listMarketplace({
      token: config.githubToken,
      refresh: Boolean(options && options.refresh),
    });
  });

  ipcMain.handle('shell:refresh-marketplace', async () => {
    const config = loadConfig();
    return listMarketplace({ token: config.githubToken, refresh: true });
  });

  ipcMain.handle('shell:list-installed-plugins', () => listInstalledPlugins());

  ipcMain.handle('shell:install-plugin', async (event, spec, options = {}) => {
    const config = loadConfig();
    const result = await installPlugin(spec, {
      token: config.githubToken,
      allowBuilds: Array.isArray(options?.allowBuilds) ? options.allowBuilds : [],
      onProgress: (payload) => sendPluginProgress(event, payload),
    });
    if (result.ok && typeof startHarness === 'function') {
      sendPluginProgress(event, { phase: 'restart', line: '正在重启 Harness' });
      await startHarness();
    }
    return result;
  });

  ipcMain.handle('shell:uninstall-plugin', async (event, name) => {
    const result = await uninstallPlugin(name, {
      onProgress: (payload) => sendPluginProgress(event, payload),
    });
    if (result.ok && typeof startHarness === 'function') {
      sendPluginProgress(event, { phase: 'restart', line: '正在重启 Harness' });
      await startHarness();
    }
    return result;
  });

  ipcMain.handle('shell:open-marketplace', () => openMarketplace());

  ipcMain.handle('shell:git-status', (_event, cwd) => gitStatus(cwd));
  ipcMain.handle('shell:git-diff', (_event, cwd) => gitDiff(cwd));
  ipcMain.handle('shell:git-commit', (_event, cwd, message) => gitCommit(cwd, message));
  ipcMain.handle('shell:git-push', (_event, cwd) => gitPush(cwd));
  ipcMain.handle('shell:git-pull', (_event, cwd) => gitPull(cwd));
  ipcMain.handle('shell:git-create-change-request', (_event, cwd, input) => gitCreateChangeRequest(cwd, input));
  ipcMain.handle('shell:list-dir', (_event, cwd, relativePath) => listDir(cwd, relativePath));
  ipcMain.handle('shell:read-file', (_event, cwd, relativePath) => readFile(cwd, relativePath));
  const pty = registerPtyIpc(ipcMain);
  const preview = registerPreviewIpc(ipcMain);

  ipcMain.handle('shell:remote-status', async () => {
    if (!remoteAccess) {
      return { enabled: false, connected: false, devices: [] };
    }
    return remoteAccess.snapshot();
  });

  ipcMain.handle('shell:remote-set-enabled', async (_event, enabled) => {
    const next = saveConfig({ remoteAccessEnabled: Boolean(enabled) });
    if (remoteAccess) {
      if (next.remoteAccessEnabled) {
        remoteAccess.start();
      } else {
        remoteAccess.stop();
      }
      return remoteAccess.snapshot();
    }
    return { enabled: Boolean(next.remoteAccessEnabled), connected: false, devices: [] };
  });

  ipcMain.handle('shell:remote-refresh-offer', async () => {
    if (!remoteAccess) {
      return { enabled: false, devices: [] };
    }
    return remoteAccess.snapshot();
  });

  ipcMain.handle('shell:remote-revoke-device', async (_event, deviceId) => {
    if (!remoteAccess) {
      return { enabled: false, devices: [] };
    }
    return remoteAccess.revokeDevice(deviceId);
  });

  ipcMain.handle('shell:install-update', async (event) => {
    try {
      return await installUpdate((payload) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('shell:update-progress', payload);
        }
      });
    } catch (error) {
      return {
        status: 'error',
        current: currentVersion(),
        repoUrl: REPO_URL,
        releasesUrl: RELEASES_PAGE,
        htmlUrl: RELEASES_PAGE,
        latest: '',
        assetName: '',
        assetUrl: '',
        launched: false,
        message: error.message || String(error),
      };
    }
  });

  return { pty, preview };
}

module.exports = { registerIpc };
