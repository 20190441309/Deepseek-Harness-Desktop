const { randomUUID } = require('node:crypto');
const { loadWorkspaceAuthority } = require('./workspace-authority');

let workspaceAuthority = null;

/** Test seam: pin the trust root (node:test runs outside Electron). */
function setWorkspaceAuthority(authority) {
  workspaceAuthority = authority;
}

function asCwd(cwd) {
  if (workspaceAuthority === null) workspaceAuthority = loadWorkspaceAuthority();
  return workspaceAuthority.resolveAuthorizedCwd(cwd);
}

function defaultShell() {
  if (process.platform === 'win32') {
    return 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

function defaultShellArgs() {
  return process.platform === 'win32' ? ['-NoLogo', '-NoProfile'] : [];
}

function defaultSpawn() {
  let pty;
  try {
    pty = require('node-pty');
  } catch {
    throw new Error('node-pty is not available');
  }
  return ({ cwd, cols, rows, onData, onExit }) => {
    const term = pty.spawn(defaultShell(), defaultShellArgs(), {
      cwd,
      cols: cols ?? 80,
      rows: rows ?? 24,
      name: 'xterm-256color',
      env: { ...process.env, TERM: 'xterm-256color' },
    });
    term.onData(onData);
    term.onExit(({ exitCode }) => {
      onExit(exitCode ?? 0);
    });
    return {
      write(data) {
        term.write(data);
      },
      resize(nextCols, nextRows) {
        term.resize(nextCols, nextRows);
      },
      kill() {
        term.kill();
      },
    };
  };
}

const BACKEND_UNAVAILABLE = 'terminal backend unavailable';

/**
 * In-process PTY table used by Electron IPC. Tests inject a fake spawn that
 * echoes writes; production lazy-loads node-pty / conpty on the first create
 * so a missing optional native module cannot take down registerIpc.
 * @param {{ spawn?: Function | null, emit?: Function }} [options]
 */
function createPtyController(options = {}) {
  let spawn = options.spawn;
  const emit = options.emit ?? (() => {});
  const sessions = new Map();

  function resolveSpawn() {
    if (spawn === null) {
      throw new Error(BACKEND_UNAVAILABLE);
    }
    if (typeof spawn === 'function') return spawn;
    spawn = defaultSpawn();
    return spawn;
  }

  function requireSession(id) {
    const session = sessions.get(id);
    if (!session) {
      throw new Error(`unknown pty id: ${id}`);
    }
    return session;
  }

  return {
    async create(input = {}) {
      const cwd = asCwd(input.cwd);
      if (!cwd) {
        throw new Error('ptyCreate requires a project cwd');
      }
      let backend;
      try {
        backend = resolveSpawn();
      } catch (error) {
        console.error('[pty] backend unavailable:', error && error.message ? error.message : error);
        throw new Error(BACKEND_UNAVAILABLE);
      }
      const id = randomUUID();
      let session;
      try {
        session = backend({
          cwd,
          cols: input.cols,
          rows: input.rows,
          onData(data) {
            emit('shell:pty-data', { id, data: String(data) });
          },
          onExit(code) {
            sessions.delete(id);
            emit('shell:pty-exit', { id, code: Number(code) || 0 });
          },
        });
      } catch (error) {
        console.error('[pty] spawn failed:', error && error.message ? error.message : error);
        throw new Error(BACKEND_UNAVAILABLE);
      }
      sessions.set(id, session);
      return { id };
    },

    async write(id, data) {
      requireSession(id).write(String(data ?? ''));
    },

    async resize(id, cols, rows) {
      requireSession(id).resize(Number(cols) || 80, Number(rows) || 24);
    },

    async kill(id) {
      const session = sessions.get(id);
      if (!session) return;
      session.kill();
      sessions.delete(id);
    },

    /** Kill every live PTY (app quit, harness restart, renderer teardown). */
    killAll() {
      for (const session of sessions.values()) {
        try {
          session.kill();
        } catch {
          // A backend that already exited must not block the sweep.
        }
      }
      sessions.clear();
    },
  };
}

/**
 * Register desktop PTY IPC on ipcMain.
 * @param {import('electron').IpcMain} ipcMain
 * @param {ReturnType<typeof createPtyController>} [controller]
 */
function registerPtyIpc(ipcMain, controller) {
  const senders = new Set();
  const live = controller ?? createPtyController({
    emit(channel, payload) {
      for (const sender of senders) {
        if (!sender.isDestroyed()) sender.send(channel, payload);
      }
    },
  });

  function track(event) {
    const sender = event.sender;
    if (sender && !senders.has(sender)) {
      senders.add(sender);
      sender.once('destroyed', () => {
        senders.delete(sender);
      });
    }
    return live;
  }

  ipcMain.handle('shell:pty-create', (event, input) => track(event).create(input));
  ipcMain.handle('shell:pty-write', (event, id, data) => track(event).write(id, data));
  ipcMain.handle('shell:pty-resize', (event, id, cols, rows) => track(event).resize(id, cols, rows));
  ipcMain.handle('shell:pty-kill', (event, id) => track(event).kill(id));
  return live;
}

module.exports = { BACKEND_UNAVAILABLE, createPtyController, registerPtyIpc, setWorkspaceAuthority, defaultShell, defaultShellArgs };
