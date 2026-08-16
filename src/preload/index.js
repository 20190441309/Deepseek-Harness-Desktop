const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shell', {
  getState: () => ipcRenderer.invoke('shell:get-state'),
  getConfig: () => ipcRenderer.invoke('shell:get-config'),
  saveConfig: (patch) => ipcRenderer.invoke('shell:save-config', patch),
  pickWorkspace: () => ipcRenderer.invoke('shell:pick-workspace'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  restart: () => ipcRenderer.invoke('shell:restart'),
  cancelRestart: () => ipcRenderer.invoke('shell:cancel-restart'),
  openSettings: () => ipcRenderer.invoke('shell:open-settings'),
  checkUpdate: () => ipcRenderer.invoke('shell:check-update'),
  installUpdate: () => ipcRenderer.invoke('shell:install-update'),
  onUpdateProgress: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:update-progress', listener);
    return () => ipcRenderer.removeListener('shell:update-progress', listener);
  },
  reportChrome: (metrics) => ipcRenderer.send('shell:chrome-metrics', metrics),
  windowAction: (action) => ipcRenderer.send('shell:window', action),
  getWindowState: () => ipcRenderer.invoke('shell:window-state'),
  onWindowState: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:window-state', listener);
    return () => ipcRenderer.removeListener('shell:window-state', listener);
  },
  onTheme: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:theme', listener);
    return () => ipcRenderer.removeListener('shell:theme', listener);
  },
  onState: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:state', listener);
    return () => ipcRenderer.removeListener('shell:state', listener);
  },
  onLog: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:log', listener);
    return () => ipcRenderer.removeListener('shell:log', listener);
  },
  listMarketplace: (options) => ipcRenderer.invoke('shell:list-marketplace', options),
  refreshMarketplace: () => ipcRenderer.invoke('shell:refresh-marketplace'),
  listInstalledPlugins: () => ipcRenderer.invoke('shell:list-installed-plugins'),
  installPlugin: (spec, options) => ipcRenderer.invoke('shell:install-plugin', spec, options),
  uninstallPlugin: (name) => ipcRenderer.invoke('shell:uninstall-plugin', name),
  seedInstallDraft: (item) => ipcRenderer.invoke('shell:seed-install-draft', item),
  openMarketplace: () => ipcRenderer.invoke('shell:open-marketplace'),
  gitStatus: (cwd) => ipcRenderer.invoke('shell:git-status', cwd),
  gitFetchForStatus: (cwd) => ipcRenderer.invoke('shell:git-fetch-status', cwd),
  gitReadPullRequest: (cwd) => ipcRenderer.invoke('shell:git-pull-request', cwd),
  gitInit: (cwd) => ipcRenderer.invoke('shell:git-init', cwd),
  gitDiff: (cwd, options) => ipcRenderer.invoke('shell:git-diff', cwd, options),
  gitCommit: (cwd, message, filePaths, actionId, options) => ipcRenderer.invoke('shell:git-commit', cwd, message, filePaths, actionId, options),
  gitChangedFiles: (cwd) => ipcRenderer.invoke('shell:git-changed-files', cwd),
  gitPush: (cwd, actionId) => ipcRenderer.invoke('shell:git-push', cwd, actionId),
  gitPull: (cwd, actionId) => ipcRenderer.invoke('shell:git-pull', cwd, actionId),
  onGitProgress: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:git-progress', listener);
    return () => ipcRenderer.removeListener('shell:git-progress', listener);
  },
  gitCreateChangeRequest: (cwd, input, actionId) => ipcRenderer.invoke('shell:git-create-change-request', cwd, input, actionId),
  gitPublishRepository: (cwd, input, actionId) => ipcRenderer.invoke('shell:git-publish', cwd, input, actionId),
  openWorkspacePath: (cwd, relativePath) => ipcRenderer.invoke('shell:open-workspace-path', cwd, relativePath),
  listDir: (cwd, relativePath) => ipcRenderer.invoke('shell:list-dir', cwd, relativePath),
  readFile: (cwd, relativePath) => ipcRenderer.invoke('shell:read-file', cwd, relativePath),
  readFileMedia: (cwd, relativePath) => ipcRenderer.invoke('shell:read-file-media', cwd, relativePath),
  writeFile: (cwd, relativePath, text) => ipcRenderer.invoke('shell:write-file', cwd, relativePath, text),
  gitStage: (cwd, relativePath) => ipcRenderer.invoke('shell:git-stage', cwd, relativePath),
  gitUnstage: (cwd, relativePath) => ipcRenderer.invoke('shell:git-unstage', cwd, relativePath),
  gitDiscard: (cwd, relativePath) => ipcRenderer.invoke('shell:git-discard', cwd, relativePath),
  gitStatusEntries: (cwd) => ipcRenderer.invoke('shell:git-status-entries', cwd),
  gitBranchList: (cwd) => ipcRenderer.invoke('shell:git-branch-list', cwd),
  gitSwitchBranch: (cwd, ref) => ipcRenderer.invoke('shell:git-switch-branch', cwd, ref),
  gitCreateBranch: (cwd, name) => ipcRenderer.invoke('shell:git-create-branch', cwd, name),
  ptyCreate: (input) => ipcRenderer.invoke('shell:pty-create', input),
  ptyWrite: (id, data) => ipcRenderer.invoke('shell:pty-write', id, data),
  ptyResize: (id, cols, rows) => ipcRenderer.invoke('shell:pty-resize', id, cols, rows),
  ptyKill: (id) => ipcRenderer.invoke('shell:pty-kill', id),
  onPtyData: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:pty-data', listener);
    return () => ipcRenderer.removeListener('shell:pty-data', listener);
  },
  onPtyExit: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:pty-exit', listener);
    return () => ipcRenderer.removeListener('shell:pty-exit', listener);
  },
  previewOpen: (input) => ipcRenderer.invoke('shell:preview-open', input),
  previewNavigate: (id, url) => ipcRenderer.invoke('shell:preview-navigate', id, url),
  previewBack: (id) => ipcRenderer.invoke('shell:preview-back', id),
  previewForward: (id) => ipcRenderer.invoke('shell:preview-forward', id),
  previewReload: (id) => ipcRenderer.invoke('shell:preview-reload', id),
  previewState: (id) => ipcRenderer.invoke('shell:preview-state', id),
  previewOpenDevTools: (id) => ipcRenderer.invoke('shell:preview-devtools', id),
  previewDiscover: () => ipcRenderer.invoke('shell:preview-discover'),
  previewResize: (id, bounds) => ipcRenderer.invoke('shell:preview-resize', id, bounds),
  previewHide: (id) => ipcRenderer.invoke('shell:preview-hide', id),
  previewShow: (id, bounds) => ipcRenderer.invoke('shell:preview-show', id, bounds),
  previewClose: (id) => ipcRenderer.invoke('shell:preview-close', id),
  onPreviewStateChange: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:preview-state-change', listener);
    return () => ipcRenderer.removeListener('shell:preview-state-change', listener);
  },
  getRemote: () => ipcRenderer.invoke('shell:get-remote'),
  saveRemote: (patch) => ipcRenderer.invoke('shell:save-remote', patch),
  rotateRemoteToken: () => ipcRenderer.invoke('shell:rotate-remote-token'),
  unbindRemoteDevice: (id) => ipcRenderer.invoke('shell:unbind-remote-device', id),
  onPluginProgress: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:plugin-progress', listener);
    return () => ipcRenderer.removeListener('shell:plugin-progress', listener);
  },
  onPluginBoot: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:plugin-boot', listener);
    return () => ipcRenderer.removeListener('shell:plugin-boot', listener);
  },
  onSeedInstallDraft: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:seed-install-draft', listener);
    return () => ipcRenderer.removeListener('shell:seed-install-draft', listener);
  },
});
