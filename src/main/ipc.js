const { ipcMain, dialog, app, shell, nativeTheme } = require('electron');
const {
  REMOTE_FEATURE_ENABLED,
  loadConfig,
  saveConfig,
  publicConfig,
  normalizeRendererConfigPatch,
} = require('./config');
const { getMainWindow, openHarnessSettings, openMarketplace, openRemote } = require('./window');
const { resolveNodeBin, resolveDshBin, sourceHarnessStatus } = require('./dsh');
const { listThemes, resolveTheme } = require('../shared/themes');
const { applyAppTheme } = require('./chrome');
const { checkUpdate, installUpdate, currentVersion, REPO_URL, RELEASES_PAGE } = require('./update');
const { listMarketplace } = require('./marketplace-catalog');
const { listInstalledPlugins, installPlugin, installMarketplacePlugin, uninstallPlugin } = require('./marketplace-install');
const { gitBranchList, gitChangedFiles, gitCommit, gitCreateBranch, gitCreateChangeRequest, gitDiff, gitDiscard, gitFetchForStatus, gitInit, gitPublishRepository, gitPull, gitPush, gitReadPullRequest, gitStage, gitStatus, gitStatusEntries, gitSwitchBranch, gitUnstage, openWorkspacePath } = require('./git');
const { registerPreviewIpc } = require('./preview');
const { registerPtyIpc } = require('./pty');
const { listDir, readFile, readFileMedia, writeFile } = require('./workspace-fs');
const { IPC_ROLES, assertIpcSender } = require('./ipc-authorization');

const BOOT_ONLY = [IPC_ROLES.BOOT];
const HARNESS_ONLY = [IPC_ROLES.HARNESS];
const CONFIG_SURFACES = [IPC_ROLES.HARNESS, IPC_ROLES.MARKETPLACE];
const ALL_SURFACES = [IPC_ROLES.BOOT, IPC_ROLES.HARNESS, IPC_ROLES.MARKETPLACE];

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
  const handle = (channel, roles, listener) => {
    ipcMain.handle(channel, (event, ...args) => {
      assertIpcSender(event, roles);
      return listener(event, ...args);
    });
  };
  const authorizeHarness = (event) => assertIpcSender(event, HARNESS_ONLY);

  handle('shell:get-state', BOOT_ONLY, () => (harness ? harness.snapshot() : dsh.snapshot()));

  handle('shell:get-config', ALL_SURFACES, () => configPayload(loadConfig()));

  handle('shell:save-config', CONFIG_SURFACES, async (_event, patch) => {
    const safePatch = normalizeRendererConfigPatch(patch || {});
    const next = saveConfig(safePatch);
    app.setLoginItemSettings({ openAtLogin: Boolean(next.openAtLogin) });
    if (Object.prototype.hasOwnProperty.call(safePatch, 'theme')) {
      applyAppTheme();
    }
    if (harness && [
      'harnessAutoRestart',
      'harnessRestartMaxAttempts',
      'harnessRestartBaseDelayMs',
    ].some((key) => Object.prototype.hasOwnProperty.call(safePatch, key))) {
      harness.refreshPolicy();
    }
    return configPayload(next);
  });

  handle('shell:open-external', CONFIG_SURFACES, async (_event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Invalid URL');
    }
    await shell.openExternal(url);
    return true;
  });

  handle('shell:pick-workspace', HARNESS_ONLY, async () => {
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

  handle('shell:restart', BOOT_ONLY, async () => {
    await startHarness();
    return harness ? harness.snapshot() : dsh.snapshot();
  });

  handle('shell:cancel-restart', BOOT_ONLY, () => (
    harness ? harness.cancelRecovery() : dsh.snapshot()
  ));

  handle('shell:open-settings', HARNESS_ONLY, () => openHarnessSettings());

  handle('shell:check-update', HARNESS_ONLY, () => checkUpdate());

  handle('shell:list-marketplace', HARNESS_ONLY, async (_event, options = {}) => {
    return listMarketplace({
      refresh: Boolean(options && options.refresh),
      locale: options?.locale,
    });
  });

  handle('shell:refresh-marketplace', HARNESS_ONLY, async (_event, options = {}) => {
    return listMarketplace({
      refresh: true,
      locale: options?.locale || 'zh',
    });
  });

  handle('shell:list-installed-plugins', HARNESS_ONLY, () => listInstalledPlugins());

  handle('shell:install-plugin', HARNESS_ONLY, async (event, spec, options = {}) => {
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

  handle('shell:install-marketplace-plugin', HARNESS_ONLY, async (event, id, options = {}) => {
    const config = loadConfig();
    const result = await installMarketplacePlugin(id, {
      token: config.githubToken,
      allowBuilds: Array.isArray(options?.allowBuilds) ? options.allowBuilds : [],
      onProgress: (payload) => sendPluginProgress(event, payload),
    });
    if (result.ok === true && typeof startHarness === 'function') {
      sendPluginProgress(event, { phase: 'restart', line: '正在重启 Harness' });
      await startHarness();
    }
    return result;
  });

  handle('shell:uninstall-plugin', HARNESS_ONLY, async (event, name) => {
    const result = await uninstallPlugin(name, {
      onProgress: (payload) => sendPluginProgress(event, payload),
    });
    if (result.ok && typeof startHarness === 'function') {
      sendPluginProgress(event, { phase: 'restart', line: '正在重启 Harness' });
      await startHarness();
    }
    return result;
  });

  handle('shell:open-marketplace', HARNESS_ONLY, () => openMarketplace());

  handle('shell:git-status', HARNESS_ONLY, (_event, cwd) => gitStatus(cwd));
  handle('shell:git-fetch-status', HARNESS_ONLY, (_event, cwd) => gitFetchForStatus(cwd));
  handle('shell:git-pull-request', HARNESS_ONLY, (_event, cwd) => gitReadPullRequest(cwd));
  handle('shell:git-init', HARNESS_ONLY, (_event, cwd) => gitInit(cwd));
  handle('shell:git-diff', HARNESS_ONLY, (_event, cwd, options) => gitDiff(cwd, options));
  const sendGitProgress = (event, actionId) => (progress) => {
    if (actionId == null || event.sender.isDestroyed()) return;
    event.sender.send('shell:git-progress', { actionId, ...progress });
  };
  handle('shell:git-commit', HARNESS_ONLY, (event, cwd, message, filePaths, actionId, options) => (
    gitCommit(cwd, message, filePaths, sendGitProgress(event, actionId), options)
  ));
  handle('shell:git-changed-files', HARNESS_ONLY, (_event, cwd) => gitChangedFiles(cwd));
  handle('shell:git-push', HARNESS_ONLY, (event, cwd, actionId) => gitPush(cwd, sendGitProgress(event, actionId)));
  handle('shell:git-pull', HARNESS_ONLY, (event, cwd, actionId) => gitPull(cwd, sendGitProgress(event, actionId)));
  handle('shell:git-create-change-request', HARNESS_ONLY, (event, cwd, input, actionId) => (
    gitCreateChangeRequest(cwd, input, sendGitProgress(event, actionId))
  ));
  handle('shell:git-publish', HARNESS_ONLY, (event, cwd, input, actionId) => (
    gitPublishRepository(cwd, input, sendGitProgress(event, actionId))
  ));
  handle('shell:open-workspace-path', HARNESS_ONLY, (_event, cwd, relativePath) => openWorkspacePath(cwd, relativePath));
  handle('shell:list-dir', HARNESS_ONLY, (_event, cwd, relativePath) => listDir(cwd, relativePath));
  handle('shell:read-file', HARNESS_ONLY, (_event, cwd, relativePath) => readFile(cwd, relativePath));
  handle('shell:read-file-media', HARNESS_ONLY, (_event, cwd, relativePath) => readFileMedia(cwd, relativePath));
  handle('shell:write-file', HARNESS_ONLY, (_event, cwd, relativePath, text) => writeFile(cwd, relativePath, text));
  handle('shell:git-stage', HARNESS_ONLY, (_event, cwd, relativePath) => gitStage(cwd, relativePath));
  handle('shell:git-unstage', HARNESS_ONLY, (_event, cwd, relativePath) => gitUnstage(cwd, relativePath));
  handle('shell:git-discard', HARNESS_ONLY, (_event, cwd, relativePath) => gitDiscard(cwd, relativePath));
  handle('shell:git-status-entries', HARNESS_ONLY, (_event, cwd) => gitStatusEntries(cwd));
  handle('shell:git-branch-list', HARNESS_ONLY, (_event, cwd) => gitBranchList(cwd));
  handle('shell:git-switch-branch', HARNESS_ONLY, (_event, cwd, ref) => gitSwitchBranch(cwd, ref));
  handle('shell:git-create-branch', HARNESS_ONLY, (_event, cwd, name) => gitCreateBranch(cwd, name));
  const pty = registerPtyIpc(ipcMain, undefined, { authorize: authorizeHarness });
  const preview = registerPreviewIpc(ipcMain, undefined, { authorize: authorizeHarness });

  handle('shell:open-remote', HARNESS_ONLY, () => {
    if (!REMOTE_FEATURE_ENABLED) {
      throw new Error('Remote is disabled in this build');
    }
    return openRemote();
  });

  handle('shell:get-remote', HARNESS_ONLY, () => {
    const snapshot = remote ? remote.snapshot() : {};
    return {
      ...snapshot,
      available: REMOTE_FEATURE_ENABLED,
      enabled: REMOTE_FEATURE_ENABLED && Boolean(snapshot.enabled),
    };
  });

  handle('shell:save-remote', HARNESS_ONLY, async (_event, patch) => {
    if (!REMOTE_FEATURE_ENABLED) {
      saveConfig({ remoteEnabled: false, remoteMode: 'lan', remoteRelayUrl: '' });
      if (remote && typeof remote.sync === 'function') {
        await remote.sync();
      }
      return { ...(remote ? remote.snapshot() : {}), available: false, enabled: false };
    }
    saveConfig(patch || {});
    if (remote && typeof remote.sync === 'function') {
      return remote.sync();
    }
    return remote ? remote.snapshot() : null;
  });

  handle('shell:rotate-remote-token', HARNESS_ONLY, async () => {
    if (!REMOTE_FEATURE_ENABLED) {
      return { ...(remote ? remote.snapshot() : {}), available: false, enabled: false };
    }
    if (remote && typeof remote.rotateToken === 'function') {
      remote.rotateToken();
      return remote.sync();
    }
    return null;
  });

  handle('shell:unbind-remote-device', HARNESS_ONLY, async (_event, id) => {
    if (!REMOTE_FEATURE_ENABLED) {
      return { ...(remote ? remote.snapshot() : {}), available: false, enabled: false };
    }
    if (remote && typeof remote.unbindDevice === 'function') {
      return remote.unbindDevice(id);
    }
    return remote ? remote.snapshot() : null;
  });

  handle('shell:install-update', HARNESS_ONLY, async (event) => {
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
