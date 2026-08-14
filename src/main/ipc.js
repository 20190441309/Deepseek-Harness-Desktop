const { ipcMain, dialog, app, shell, nativeTheme } = require('electron');
const { loadConfig, saveConfig, publicConfig } = require('./config');
const { getMainWindow, openHarnessSettings, openMarketplace, openRemote } = require('./window');
const { resolveNodeBin, resolveDshBin, sourceHarnessStatus } = require('./dsh');
const { listThemes, resolveTheme } = require('../shared/themes');
const { applyAppTheme } = require('./chrome');
const { checkUpdate, installUpdate, currentVersion, REPO_URL, RELEASES_PAGE } = require('./update');
const { listMarketplace } = require('./marketplace-catalog');
const { listInstalledPlugins, installPlugin, uninstallPlugin } = require('./marketplace-install');

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

function registerIpc({ dsh, startHarness, remote }) {
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

  ipcMain.handle('shell:open-remote', () => openRemote());

  ipcMain.handle('shell:get-remote', () => (remote ? remote.snapshot() : null));

  ipcMain.handle('shell:save-remote', async (_event, patch) => {
    saveConfig(patch || {});
    if (remote && typeof remote.sync === 'function') {
      return remote.sync();
    }
    return remote ? remote.snapshot() : null;
  });

  ipcMain.handle('shell:rotate-remote-token', async () => {
    if (remote && typeof remote.rotateToken === 'function') {
      remote.rotateToken();
      return remote.sync();
    }
    return null;
  });

  ipcMain.handle('shell:unbind-remote-device', async (_event, id) => {
    if (remote && typeof remote.unbindDevice === 'function') {
      return remote.unbindDevice(id);
    }
    return remote ? remote.snapshot() : null;
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
}

module.exports = { registerIpc };
