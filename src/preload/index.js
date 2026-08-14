const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shell', {
  getState: () => ipcRenderer.invoke('shell:get-state'),
  getConfig: () => ipcRenderer.invoke('shell:get-config'),
  saveConfig: (patch) => ipcRenderer.invoke('shell:save-config', patch),
  pickWorkspace: () => ipcRenderer.invoke('shell:pick-workspace'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  restart: () => ipcRenderer.invoke('shell:restart'),
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
  openMarketplace: () => ipcRenderer.invoke('shell:open-marketplace'),
  gitStatus: (cwd) => ipcRenderer.invoke('shell:git-status', cwd),
  gitDiff: (cwd) => ipcRenderer.invoke('shell:git-diff', cwd),
  gitCommit: (cwd, message) => ipcRenderer.invoke('shell:git-commit', cwd, message),
  gitPush: (cwd) => ipcRenderer.invoke('shell:git-push', cwd),
  gitPull: (cwd) => ipcRenderer.invoke('shell:git-pull', cwd),
  gitCreateChangeRequest: (cwd, input) => ipcRenderer.invoke('shell:git-create-change-request', cwd, input),
  listDir: (cwd, relativePath) => ipcRenderer.invoke('shell:list-dir', cwd, relativePath),
  readFile: (cwd, relativePath) => ipcRenderer.invoke('shell:read-file', cwd, relativePath),
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
  onPluginProgress: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:plugin-progress', listener);
    return () => ipcRenderer.removeListener('shell:plugin-progress', listener);
  },
});
