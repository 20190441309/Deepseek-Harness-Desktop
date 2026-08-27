/**
 * ChisaCode v2 phone controller: connection lifecycle, reconnect resync,
 * and per-session draft persistence. Pure logic over an injected DaemonClient
 * so app.js stays a thin UI binder and this file stays unit-testable.
 */

const DRAFT_KEY_PREFIX = 'dsh-chisacode-drafts:';

/**
 * Map a DaemonClient ConnectionState to the three UI phases.
 * @param {{ status?: string, reason?: string, attempt?: number }} state
 * @returns {{ phase: 'online'|'connecting'|'offline', label: string }}
 */
function connectionPhase(state) {
  const status = state?.status;
  if (status === 'connected') {
    return { phase: 'online', label: '' };
  }
  if (status === 'connecting') {
    return { phase: 'connecting', label: '正在重新连接电脑…' };
  }
  const reason = typeof state?.reason === 'string' && state.reason ? `：${state.reason}` : '';
  return { phase: 'offline', label: `连接已断开${reason}；正在等待重连` };
}

/**
 * Observe DaemonClient connection status. The subscription fires immediately
 * with the current state; an initial `connected` must NOT count as a
 * reconnect. Only connected → (connecting|disconnected) → connected triggers
 * onReconnected, and only once per drop.
 * @param {{ subscribeConnectionStatus: (listener: (state: object) => void) => () => void }} client
 * @param {{ onStatus?: (phase: object, state: object) => void, onReconnected?: () => void }} handlers
 * @returns {() => void} disposer
 */
function watchConnection(client, handlers = {}) {
  if (typeof client?.subscribeConnectionStatus !== 'function') {
    throw new Error('DaemonClient 不支持连接状态订阅');
  }
  let sawDrop = false;
  return client.subscribeConnectionStatus((state) => {
    handlers.onStatus?.(connectionPhase(state), state);
    if (state?.status === 'connected') {
      if (sawDrop) {
        sawDrop = false;
        handlers.onReconnected?.();
      }
      return;
    }
    if (state?.status === 'connecting' || state?.status === 'disconnected') {
      sawDrop = true;
    }
  });
}

/**
 * Authoritative resync after a reconnect: re-fetch the agent directory (with
 * a fresh subscription) and, when a session is open, its timeline tail.
 * Errors propagate to the caller — a failed resync must be visible, never a
 * silently stale page.
 * @param {object} client DaemonClient
 * @param {{ sessionId?: string, agentLimit?: number, timelineLimit?: number }} options
 * @returns {Promise<{ agents: object, timeline: object | null }>}
 */
async function resyncAfterReconnect(client, { sessionId = '', agentLimit = 100, timelineLimit = 200 } = {}) {
  const agents = await client.fetchAgents({
    page: { limit: agentLimit },
    subscribe: {},
  });
  let timeline = null;
  if (sessionId) {
    timeline = await client.fetchAgentTimeline(sessionId, {
      direction: 'tail',
      limit: timelineLimit,
      projection: 'projected',
    });
  }
  return { agents, timeline };
}

/**
 * Per-server draft store: keeps unsent composer text per sessionId so drafts
 * survive reconnects and session switches. Best-effort local convenience —
 * storage failures degrade to in-memory for this page load, never throw.
 * @param {Storage | null} storage
 * @param {string} serverId
 */
function createDraftStore(storage, serverId) {
  const key = `${DRAFT_KEY_PREFIX}${serverId}`;
  const memory = {};

  function readAll() {
    try {
      const parsed = JSON.parse(storage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return { ...memory };
    }
  }

  function writeAll(all) {
    Object.assign(memory, all);
    for (const id of Object.keys(memory)) {
      if (!(id in all)) delete memory[id];
    }
    try {
      storage.setItem(key, JSON.stringify(all));
    } catch { /* storage unavailable → memory only */ }
  }

  return {
    load(sessionId) {
      if (!sessionId) return '';
      const value = readAll()[sessionId];
      return typeof value === 'string' ? value : '';
    },
    save(sessionId, text) {
      if (!sessionId) return;
      const all = readAll();
      if (typeof text === 'string' && text) {
        all[sessionId] = text;
      } else {
        delete all[sessionId];
      }
      writeAll(all);
    },
    clear(sessionId) {
      if (!sessionId) return;
      const all = readAll();
      delete all[sessionId];
      writeAll(all);
    },
    clearAll() {
      for (const id of Object.keys(memory)) delete memory[id];
      try {
        storage.removeItem(key);
      } catch { /* ignore */ }
    },
  };
}

export {
  connectionPhase,
  watchConnection,
  resyncAfterReconnect,
  createDraftStore,
};
