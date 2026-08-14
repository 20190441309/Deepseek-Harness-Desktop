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
  onPluginProgress: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:plugin-progress', listener);
    return () => ipcRenderer.removeListener('shell:plugin-progress', listener);
  },
});
