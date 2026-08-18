const { contextBridge, ipcRenderer } = require('electron');

const SHELL_ROLES = new Set(['boot', 'harness', 'marketplace']);

function shellRole(argv = process.argv) {
  const prefix = '--dshd-shell-role=';
  const value = argv.find((item) => typeof item === 'string' && item.startsWith(prefix));
  const role = value ? value.slice(prefix.length) : '';
  return SHELL_ROLES.has(role) ? role : null;
}

function invoke(renderer, channel) {
  return (...args) => renderer.invoke(channel, ...args);
}

function send(renderer, channel) {
  return (...args) => renderer.send(channel, ...args);
}

function subscribe(renderer, channel) {
  return (handler) => {
    const listener = (_event, payload) => handler(payload);
    renderer.on(channel, listener);
    return () => renderer.removeListener(channel, listener);
  };
}

function windowApi(renderer) {
  return {
    windowAction: send(renderer, 'shell:window'),
    getWindowState: invoke(renderer, 'shell:window-state'),
    onWindowState: subscribe(renderer, 'shell:window-state'),
    onTheme: subscribe(renderer, 'shell:theme'),
  };
}

function configApi(renderer) {
  return {
    getConfig: invoke(renderer, 'shell:get-config'),
    saveConfig: invoke(renderer, 'shell:save-config'),
  };
}

function bootApi(renderer) {
  return {
    ...windowApi(renderer),
    getConfig: invoke(renderer, 'shell:get-config'),
    getState: invoke(renderer, 'shell:get-state'),
    restart: invoke(renderer, 'shell:restart'),
    cancelRestart: invoke(renderer, 'shell:cancel-restart'),
    onState: subscribe(renderer, 'shell:state'),
    onLog: subscribe(renderer, 'shell:log'),
    onPluginBoot: subscribe(renderer, 'shell:plugin-boot'),
  };
}

function marketplaceApi(renderer) {
  return {
    ...windowApi(renderer),
    ...configApi(renderer),
    openExternal: invoke(renderer, 'shell:open-external'),
    listMarketplace: invoke(renderer, 'shell:list-marketplace'),
    refreshMarketplace: invoke(renderer, 'shell:refresh-marketplace'),
    listInstalledPlugins: invoke(renderer, 'shell:list-installed-plugins'),
    uninstallPlugin: invoke(renderer, 'shell:uninstall-plugin'),
    seedInstallDraft: invoke(renderer, 'shell:seed-install-draft'),
    onPluginProgress: subscribe(renderer, 'shell:plugin-progress'),
  };
}

function harnessApi(renderer) {
  return {
    ...windowApi(renderer),
    ...configApi(renderer),
    pickWorkspace: invoke(renderer, 'shell:pick-workspace'),
    openExternal: invoke(renderer, 'shell:open-external'),
    openSettings: invoke(renderer, 'shell:open-settings'),
    checkUpdate: invoke(renderer, 'shell:check-update'),
    installUpdate: invoke(renderer, 'shell:install-update'),
    onUpdateProgress: subscribe(renderer, 'shell:update-progress'),
    reportChrome: send(renderer, 'shell:chrome-metrics'),
    listMarketplace: invoke(renderer, 'shell:list-marketplace'),
    refreshMarketplace: invoke(renderer, 'shell:refresh-marketplace'),
    listInstalledPlugins: invoke(renderer, 'shell:list-installed-plugins'),
    installPlugin: invoke(renderer, 'shell:install-plugin'),
    uninstallPlugin: invoke(renderer, 'shell:uninstall-plugin'),
    seedInstallDraft: invoke(renderer, 'shell:seed-install-draft'),
    openMarketplace: invoke(renderer, 'shell:open-marketplace'),
    onPluginProgress: subscribe(renderer, 'shell:plugin-progress'),
    onSeedInstallDraft: subscribe(renderer, 'shell:seed-install-draft'),
    gitStatus: invoke(renderer, 'shell:git-status'),
    gitFetchForStatus: invoke(renderer, 'shell:git-fetch-status'),
    gitReadPullRequest: invoke(renderer, 'shell:git-pull-request'),
    gitInit: invoke(renderer, 'shell:git-init'),
    gitDiff: invoke(renderer, 'shell:git-diff'),
    gitCommit: invoke(renderer, 'shell:git-commit'),
    gitPush: invoke(renderer, 'shell:git-push'),
    gitPull: invoke(renderer, 'shell:git-pull'),
    onGitProgress: subscribe(renderer, 'shell:git-progress'),
    gitCreateChangeRequest: invoke(renderer, 'shell:git-create-change-request'),
    gitPublishRepository: invoke(renderer, 'shell:git-publish'),
    openWorkspacePath: invoke(renderer, 'shell:open-workspace-path'),
    listDir: invoke(renderer, 'shell:list-dir'),
    readFile: invoke(renderer, 'shell:read-file'),
    readFileMedia: invoke(renderer, 'shell:read-file-media'),
    writeFile: invoke(renderer, 'shell:write-file'),
    gitStage: invoke(renderer, 'shell:git-stage'),
    gitUnstage: invoke(renderer, 'shell:git-unstage'),
    gitDiscard: invoke(renderer, 'shell:git-discard'),
    gitStatusEntries: invoke(renderer, 'shell:git-status-entries'),
    gitBranchList: invoke(renderer, 'shell:git-branch-list'),
    gitSwitchBranch: invoke(renderer, 'shell:git-switch-branch'),
    gitCreateBranch: invoke(renderer, 'shell:git-create-branch'),
    ptyCreate: invoke(renderer, 'shell:pty-create'),
    ptyWrite: invoke(renderer, 'shell:pty-write'),
    ptyResize: invoke(renderer, 'shell:pty-resize'),
    ptyKill: invoke(renderer, 'shell:pty-kill'),
    onPtyData: subscribe(renderer, 'shell:pty-data'),
    onPtyExit: subscribe(renderer, 'shell:pty-exit'),
    previewOpen: invoke(renderer, 'shell:preview-open'),
    previewNavigate: invoke(renderer, 'shell:preview-navigate'),
    previewBack: invoke(renderer, 'shell:preview-back'),
    previewForward: invoke(renderer, 'shell:preview-forward'),
    previewReload: invoke(renderer, 'shell:preview-reload'),
    previewState: invoke(renderer, 'shell:preview-state'),
    previewOpenDevTools: invoke(renderer, 'shell:preview-devtools'),
    previewDiscover: invoke(renderer, 'shell:preview-discover'),
    previewResize: invoke(renderer, 'shell:preview-resize'),
    previewHide: invoke(renderer, 'shell:preview-hide'),
    previewShow: invoke(renderer, 'shell:preview-show'),
    previewClose: invoke(renderer, 'shell:preview-close'),
    onPreviewStateChange: subscribe(renderer, 'shell:preview-state-change'),
  };
}

function buildShellApi(role, renderer) {
  if (role === 'boot') return bootApi(renderer);
  if (role === 'marketplace') return marketplaceApi(renderer);
  if (role === 'harness') return harnessApi(renderer);
  return null;
}

const role = shellRole();
const isMainFrame = process.isMainFrame !== false;
const api = isMainFrame ? buildShellApi(role, ipcRenderer) : null;

if (api) {
  contextBridge.exposeInMainWorld('shell', api);
}

if (typeof module !== 'undefined') {
  module.exports = { buildShellApi, shellRole };
}
