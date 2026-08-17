const { randomUUID } = require('node:crypto');
const net = require('node:net');
const { isLoopbackHttpUrl, rewriteLoopbackLoadUrl } = require('./local-url');

const PREVIEW_PARTITION = 'dshd-preview';
const DISCOVER_PORTS = [3000, 5173, 4173, 8080, 4321, 8000, 5000];
const DISCOVER_TIMEOUT_MS = 200;
/** Document navigations that must stay on loopback. */
const FRAME_RESOURCE_TYPES = new Set(['mainFrame', 'subFrame']);

/**
 * Local preview document URLs only: http(s) to loopback. Arbitrary hosts,
 * file:, and script URLs are rejected so the view never follows a
 * credentialed hop. Subresource loads (fonts, CDN scripts) are filtered
 * separately by {@link previewRequestFilter}.
 * @param {unknown} raw
 * @returns {boolean}
 */
function isAllowedPreviewUrl(raw) {
  return isLoopbackHttpUrl(raw);
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
    const next = rewriteLoopbackLoadUrl(url);
    if (next) view.webContents.loadURL(next);
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
 * Cancel non-loopback document navigations (mainFrame / subFrame). Allow
 * other resource types so local Vite/Next apps can load CDN fonts and scripts
 * while top-level navigation stays on loopback via will-navigate / will-redirect.
 * @param {{ url?: string, resourceType?: string }} details
 * @returns {{ cancel: boolean }}
 */
function previewRequestFilter(details) {
  const type = details && details.resourceType;
  if (typeof type === 'string' && !FRAME_RESOURCE_TYPES.has(type)) {
    return { cancel: false };
  }
  return { cancel: !isAllowedPreviewUrl(details && details.url) };
}

/**
 * Probe one loopback TCP port. Resolves true only when the handshake connects.
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function probeLocalPort(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => { finish(false); }, DISCOVER_TIMEOUT_MS);
    socket.once('connect', () => {
      clearTimeout(timer);
      finish(true);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      finish(false);
    });
  });
}

/**
 * List common local-dev URLs that currently accept a TCP connection.
 * @param {(port: number) => Promise<boolean>} [probe]
 * @returns {Promise<{ url: string, port: number }[]>}
 */
async function discoverLocalServers(probe = probeLocalPort) {
  const found = [];
  await Promise.all(DISCOVER_PORTS.map(async (port) => {
    if (await probe(port)) found.push({ url: `http://127.0.0.1:${port}`, port });
  }));
  found.sort((left, right) => left.port - right.port);
  return found;
}

function sessionState(session) {
  const contents = session.view.webContents;
  const url = typeof contents.getURL === 'function' && contents.getURL()
    ? contents.getURL()
    : session.url;
  return {
    ok: true,
    id: session.id,
    url,
    canGoBack: typeof contents.canGoBack === 'function' ? contents.canGoBack() : false,
    canGoForward: typeof contents.canGoForward === 'function' ? contents.canGoForward() : false,
  };
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
 * @param {{ attach?: Function, onState?: (state: object) => void }} [options]
 */
function createPreviewController(options = {}) {
  const attach = options.attach ?? defaultAttach;
  const onState = typeof options.onState === 'function' ? options.onState : null;
  const sessions = new Map();

  function requireSession(id) {
    const session = sessions.get(id);
    if (!session) {
      throw new Error(`unknown preview id: ${id}`);
    }
    return session;
  }

  function bindNavigation(session) {
    const emit = () => {
      const state = sessionState(session);
      session.url = state.url;
      if (onState) onState(state);
    };
    session.view.webContents.on('did-navigate', emit);
    session.view.webContents.on('did-navigate-in-page', emit);
  }

  return {
    async open(input = {}) {
      const loadUrl = rewriteLoopbackLoadUrl(input.url);
      if (!loadUrl) return rejectRemote();
      const id = randomUUID();
      const view = attach({
        id,
        url: loadUrl,
        bounds: input.bounds,
        partition: PREVIEW_PARTITION,
        extraHeaders: null,
      });
      guardView(view);
      const session = { id, url: loadUrl, view };
      sessions.set(id, session);
      bindNavigation(session);
      view.webContents.loadURL(loadUrl);
      return { ok: true, id, url: loadUrl };
    },

    async navigate(id, url) {
      const loadUrl = rewriteLoopbackLoadUrl(url);
      if (!loadUrl) return rejectRemote();
      const session = requireSession(id);
      session.view.webContents.loadURL(loadUrl);
      session.url = loadUrl;
      return { ok: true, id, url: loadUrl };
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

    async back(id) {
      const session = requireSession(id);
      const contents = session.view.webContents;
      if (typeof contents.canGoBack === 'function' && contents.canGoBack() && typeof contents.goBack === 'function') {
        contents.goBack();
      }
      return sessionState(session);
    },

    async forward(id) {
      const session = requireSession(id);
      const contents = session.view.webContents;
      if (typeof contents.canGoForward === 'function' && contents.canGoForward() && typeof contents.goForward === 'function') {
        contents.goForward();
      }
      return sessionState(session);
    },

    async reload(id) {
      const session = requireSession(id);
      const contents = session.view.webContents;
      if (typeof contents.reload === 'function') contents.reload();
      return sessionState(session);
    },

    async state(id) {
      return sessionState(requireSession(id));
    },

    async openDevTools(id) {
      const session = requireSession(id);
      const contents = session.view.webContents;
      if (typeof contents.openDevTools === 'function') contents.openDevTools({ mode: 'detach' });
      return { ok: true, id };
    },

    async close(id) {
      const session = sessions.get(id);
      if (!session) return;
      session.view.destroy();
      sessions.delete(id);
    },

    /** Destroy every live view (app quit, harness restart, renderer teardown). */
    async closeAll() {
      for (const session of sessions.values()) {
        try {
          session.view.destroy();
        } catch {
          // A view that already closed must not block the sweep.
        }
      }
      sessions.clear();
    },
  };
}

/**
 * Register desktop preview IPC on ipcMain.
 * @param {import('electron').IpcMain} ipcMain
 * @param {ReturnType<typeof createPreviewController>} [controller]
 */
function registerPreviewIpc(ipcMain, controller, options = {}) {
  const authorize = typeof options.authorize === 'function' ? options.authorize : () => {};
  let host = null;
  const remember = (event) => {
    authorize(event);
    host = event && event.sender ? event.sender : host;
  };
  const live = controller ?? createPreviewController({
    onState(state) {
      if (host && typeof host.isDestroyed === 'function' && host.isDestroyed()) return;
      if (host && typeof host.send === 'function') host.send('shell:preview-state-change', state);
    },
  });
  ipcMain.handle('shell:preview-open', (event, input) => {
    remember(event);
    return live.open(input);
  });
  ipcMain.handle('shell:preview-navigate', (event, id, url) => {
    remember(event);
    return live.navigate(id, url);
  });
  ipcMain.handle('shell:preview-back', (event, id) => {
    remember(event);
    return live.back(id);
  });
  ipcMain.handle('shell:preview-forward', (event, id) => {
    remember(event);
    return live.forward(id);
  });
  ipcMain.handle('shell:preview-reload', (event, id) => {
    remember(event);
    return live.reload(id);
  });
  ipcMain.handle('shell:preview-state', (event, id) => {
    remember(event);
    return live.state(id);
  });
  ipcMain.handle('shell:preview-devtools', (event, id) => {
    remember(event);
    return live.openDevTools(id);
  });
  ipcMain.handle('shell:preview-discover', (event) => {
    remember(event);
    return discoverLocalServers();
  });
  ipcMain.handle('shell:preview-resize', (event, id, bounds) => {
    remember(event);
    return live.resize(id, bounds);
  });
  ipcMain.handle('shell:preview-hide', (event, id) => {
    remember(event);
    return live.hide(id);
  });
  ipcMain.handle('shell:preview-show', (event, id, bounds) => {
    remember(event);
    return live.show(id, bounds);
  });
  ipcMain.handle('shell:preview-close', (event, id) => {
    remember(event);
    return live.close(id);
  });
  return live;
}

module.exports = {
  PREVIEW_PARTITION,
  DISCOVER_PORTS,
  isAllowedPreviewUrl,
  previewRequestFilter,
  discoverLocalServers,
  createPreviewController,
  registerPreviewIpc,
};
