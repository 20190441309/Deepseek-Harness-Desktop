const { randomUUID } = require('node:crypto');

const PREVIEW_PARTITION = 'dsh-preview';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * Local preview URLs only: http(s) to loopback. Arbitrary hosts, file:, and
 * script URLs are rejected so the view never follows a credentialed hop.
 * @param {unknown} raw
 * @returns {boolean}
 */
function isAllowedPreviewUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return false;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    // Invalid URL text cannot be a local preview target.
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
}

function rejectRemote() {
  return { ok: false, message: 'Preview only opens local URLs.' };
}

function defaultAttach({ bounds, partition }) {
  const { BrowserView, session } = require('electron');
  const { getMainWindow } = require('./window');
  const win = getMainWindow();
  if (!win) {
    throw new Error('preview requires the desktop window');
  }
  const ses = session.fromPartition(partition);
  const view = new BrowserView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      session: ses,
    },
  });
  win.addBrowserView(view);
  if (bounds) view.setBounds(bounds);
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedPreviewUrl(url)) view.webContents.loadURL(url);
    return { action: 'deny' };
  });
  let visible = true;
  return {
    partition,
    extraHeaders: null,
    webContents: view.webContents,
    webRequest: ses.webRequest,
    setBounds(next) {
      view.setBounds(next);
    },
    setVisible(next) {
      if (next === visible) return;
      visible = next;
      if (next) win.addBrowserView(view);
      else win.removeBrowserView(view);
    },
    destroy() {
      win.removeBrowserView(view);
      view.webContents.close();
    },
  };
}

/**
 * Cancel any non-loopback request, including iframe and subresource loads.
 * @param {{ url?: string }} details
 * @returns {{ cancel: boolean }}
 */
function previewRequestFilter(details) {
  return { cancel: !isAllowedPreviewUrl(details && details.url) };
}

function guardView(view) {
  const deny = (event, next) => {
    if (!isAllowedPreviewUrl(next)) event.preventDefault();
  };
  view.webContents.on('will-navigate', deny);
  view.webContents.on('will-redirect', deny);
  const webRequest = view.webRequest;
  if (webRequest && typeof webRequest.onBeforeRequest === 'function') {
    webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      callback(previewRequestFilter(details));
    });
  }
}

/**
 * In-process preview table. Tests inject `attach`; production uses BrowserView
 * on an isolated partition so the user API key never rides the guest session.
 * @param {{ attach?: Function }} [options]
 */
function createPreviewController(options = {}) {
  const attach = options.attach ?? defaultAttach;
  const sessions = new Map();

  function requireSession(id) {
    const session = sessions.get(id);
    if (!session) {
      throw new Error(`unknown preview id: ${id}`);
    }
    return session;
  }

  return {
    async open(input = {}) {
      const url = input.url;
      if (!isAllowedPreviewUrl(url)) return rejectRemote();
      const id = randomUUID();
      const view = attach({
        id,
        url,
        bounds: input.bounds,
        partition: PREVIEW_PARTITION,
        extraHeaders: null,
      });
      guardView(view);
      view.webContents.loadURL(url);
      sessions.set(id, { id, url, view });
      return { ok: true, id, url };
    },

    async navigate(id, url) {
      if (!isAllowedPreviewUrl(url)) return rejectRemote();
      const session = requireSession(id);
      session.view.webContents.loadURL(url);
      session.url = url;
      return { ok: true, id, url };
    },

    async resize(id, bounds) {
      const session = sessions.get(id);
      if (!session || !bounds) return;
      session.view.setBounds(bounds);
    },

    async hide(id) {
      const session = sessions.get(id);
      if (!session) return;
      session.view.setVisible(false);
    },

    async show(id, bounds) {
      const session = requireSession(id);
      session.view.setVisible(true);
      if (bounds) session.view.setBounds(bounds);
    },

    async close(id) {
      const session = sessions.get(id);
      if (!session) return;
      session.view.destroy();
      sessions.delete(id);
    },
  };
}

/**
 * Register desktop preview IPC on ipcMain.
 * @param {import('electron').IpcMain} ipcMain
 * @param {ReturnType<typeof createPreviewController>} [controller]
 */
function registerPreviewIpc(ipcMain, controller) {
  const live = controller ?? createPreviewController();
  ipcMain.handle('shell:preview-open', (_event, input) => live.open(input));
  ipcMain.handle('shell:preview-navigate', (_event, id, url) => live.navigate(id, url));
  ipcMain.handle('shell:preview-resize', (_event, id, bounds) => live.resize(id, bounds));
  ipcMain.handle('shell:preview-hide', (_event, id) => live.hide(id));
  ipcMain.handle('shell:preview-show', (_event, id, bounds) => live.show(id, bounds));
  ipcMain.handle('shell:preview-close', (_event, id) => live.close(id));
}

module.exports = {
  PREVIEW_PARTITION,
  isAllowedPreviewUrl,
  previewRequestFilter,
  createPreviewController,
  registerPreviewIpc,
};
