const { ipcMain, dialog, app, shell, nativeTheme } = require('electron');
const { loadConfig, saveConfig, publicConfig } = require('./config');
const { getMainWindow, openHarnessSettings } = require('./window');
const { resolveNodeBin, resolveDshBin, sourceHarnessStatus } = require('./dsh');
const { listThemes, resolveTheme } = require('../shared/themes');
const { applyAppTheme } = require('./chrome');
const { checkUpdate, installUpdate, currentVersion, REPO_URL, RELEASES_PAGE } = require('./update');

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

function registerIpc({ dsh, startHarness }) {
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
