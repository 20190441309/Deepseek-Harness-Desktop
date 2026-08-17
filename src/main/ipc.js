const { ipcMain, dialog, app, shell, nativeTheme } = require('electron');
const { loadConfig, saveConfig, publicConfig } = require('./config');
const { getMainWindow, getHarnessWebContents, openHarnessSettings, openMarketplace, openRemote, showMain, isHarnessLoaded, closeMarketplaceWindow } = require('./window');
const { resolveNodeBin, resolveDshBin, sourceHarnessStatus } = require('./dsh');
const { listThemes, resolveTheme } = require('../shared/themes');
const { applyAppTheme } = require('./chrome');
const { checkUpdate, installUpdate, currentVersion, REPO_URL, RELEASES_PAGE } = require('./update');
const { listMarketplace } = require('./marketplace-catalog');
const { listInstalledPlugins, installPlugin, uninstallPlugin } = require('./marketplace-install');
const { gitBranchList, gitChangedFiles, gitCommit, gitCreateBranch, gitCreateChangeRequest, gitDiff, gitDiscard, gitFetchForStatus, gitInit, gitPublishRepository, gitPull, gitPush, gitReadPullRequest, gitStage, gitStatus, gitStatusEntries, gitSwitchBranch, gitUnstage, openWorkspacePath } = require('./git');
const { registerPreviewIpc } = require('./preview');
const { registerPtyIpc } = require('./pty');
const { listDir, readFile, readFileMedia, writeFile } = require('./workspace-fs');
const { isRemoteModeOnlyPatch } = require('./remote');

function configLocale(config = loadConfig()) {
  return config.locale === 'en' ? 'en' : 'zh';
}

function configPayload(config) {
  return {
    ...publicConfig(config),
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

function registerIpc({ dsh, harness, startHarness, remote }) {
  ipcMain.handle('shell:get-state', () => (harness ? harness.snapshot() : dsh.snapshot()));

  ipcMain.handle('shell:get-config', () => configPayload(loadConfig()));

  ipcMain.handle('shell:save-config', async (_event, patch) => {
    const next = saveConfig(patch || {});
    app.setLoginItemSettings({ openAtLogin: Boolean(next.openAtLogin) });
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'theme')) {
      applyAppTheme();
    }
    if (harness && patch && [
      'harnessAutoRestart',
      'harnessRestartMaxAttempts',
      'harnessRestartBaseDelayMs',
    ].some((key) => Object.prototype.hasOwnProperty.call(patch, key))) {
      harness.refreshPolicy();
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
    return harness ? harness.snapshot() : dsh.snapshot();
  });

  ipcMain.handle('shell:cancel-restart', () => (
    harness ? harness.cancelRecovery() : dsh.snapshot()
  ));

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

  ipcMain.handle('shell:seed-install-draft', async (_event, item) => {
    const repo = String(item?.repo || '').trim();
    const installSpec = String(item?.installSpec || '').trim();
    if (!repo || !installSpec) {
      return { ok: false, error: 'missing-item' };
    }
    const win = showMain();
    if (!win || !isHarnessLoaded(win)) {
      return { ok: false, error: 'harness-not-ready' };
    }
    const wc = getHarnessWebContents(win) || win.webContents;
    wc.send('shell:seed-install-draft', { repo, installSpec });
    closeMarketplaceWindow();
    return { ok: true };
  });

  ipcMain.handle('shell:git-status', (_event, cwd) => gitStatus(cwd));
  ipcMain.handle('shell:git-fetch-status', (_event, cwd) => gitFetchForStatus(cwd));
  ipcMain.handle('shell:git-pull-request', (_event, cwd) => gitReadPullRequest(cwd));
  ipcMain.handle('shell:git-init', (_event, cwd) => gitInit(cwd));
  ipcMain.handle('shell:git-diff', (_event, cwd, options) => gitDiff(cwd, options));
  const sendGitProgress = (event, actionId) => (progress) => {
    if (actionId == null || event.sender.isDestroyed()) return;
    event.sender.send('shell:git-progress', { actionId, ...progress });
  };
  ipcMain.handle('shell:git-commit', (event, cwd, message, filePaths, actionId, options) => (
    gitCommit(cwd, message, filePaths, sendGitProgress(event, actionId), options)
  ));
  ipcMain.handle('shell:git-changed-files', (_event, cwd) => gitChangedFiles(cwd));
  ipcMain.handle('shell:git-push', (event, cwd, actionId) => gitPush(cwd, sendGitProgress(event, actionId)));
  ipcMain.handle('shell:git-pull', (event, cwd, actionId) => gitPull(cwd, sendGitProgress(event, actionId)));
  ipcMain.handle('shell:git-create-change-request', (event, cwd, input, actionId) => (
    gitCreateChangeRequest(cwd, input, sendGitProgress(event, actionId))
  ));
  ipcMain.handle('shell:git-publish', (event, cwd, input, actionId) => (
    gitPublishRepository(cwd, input, sendGitProgress(event, actionId))
  ));
  ipcMain.handle('shell:open-workspace-path', (_event, cwd, relativePath) => openWorkspacePath(cwd, relativePath));
  ipcMain.handle('shell:list-dir', (_event, cwd, relativePath) => listDir(cwd, relativePath));
  ipcMain.handle('shell:read-file', (_event, cwd, relativePath) => readFile(cwd, relativePath));
  ipcMain.handle('shell:read-file-media', (_event, cwd, relativePath) => readFileMedia(cwd, relativePath));
  ipcMain.handle('shell:write-file', (_event, cwd, relativePath, text) => writeFile(cwd, relativePath, text));
  ipcMain.handle('shell:git-stage', (_event, cwd, relativePath) => gitStage(cwd, relativePath));
  ipcMain.handle('shell:git-unstage', (_event, cwd, relativePath) => gitUnstage(cwd, relativePath));
  ipcMain.handle('shell:git-discard', (_event, cwd, relativePath) => gitDiscard(cwd, relativePath));
  ipcMain.handle('shell:git-status-entries', (_event, cwd) => gitStatusEntries(cwd));
  ipcMain.handle('shell:git-branch-list', (_event, cwd) => gitBranchList(cwd));
  ipcMain.handle('shell:git-switch-branch', (_event, cwd, ref) => gitSwitchBranch(cwd, ref));
  ipcMain.handle('shell:git-create-branch', (_event, cwd, name) => gitCreateBranch(cwd, name));
  const pty = registerPtyIpc(ipcMain);
  const preview = registerPreviewIpc(ipcMain);

  ipcMain.handle('shell:open-remote', () => openRemote());

  ipcMain.handle('shell:get-remote', () => (remote ? remote.snapshot() : null));

  ipcMain.handle('shell:save-remote', async (_event, patch) => {
    saveConfig(patch || {});
    if (remote && isRemoteModeOnlyPatch(patch)) {
      // Mode only changes the pairing QR; LAN and relay stay as the enable flag left them.
      return remote.snapshot();
    }
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

  return { pty, preview };
}

module.exports = { registerIpc };
