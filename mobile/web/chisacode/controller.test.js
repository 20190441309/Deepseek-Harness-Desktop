import test from 'node:test';
import assert from 'node:assert/strict';
import {
  connectionPhase,
  createDraftStore,
  resyncAfterReconnect,
  watchConnection,
} from './controller.js';

function fakeConnectionClient(initialState) {
  const listeners = new Set();
  let current = initialState;
  return {
    subscribeConnectionStatus(listener) {
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
    emit(state) {
      current = state;
      for (const listener of listeners) listener(state);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

test('connectionPhase maps DaemonClient states to the three UI phases', () => {
  assert.deepEqual(connectionPhase({ status: 'connected' }), { phase: 'online', label: '' });
  assert.equal(connectionPhase({ status: 'connecting', attempt: 2 }).phase, 'connecting');
  assert.equal(connectionPhase({ status: 'disconnected' }).phase, 'offline');
  assert.match(connectionPhase({ status: 'disconnected', reason: 'relay down' }).label, /relay down/);
  assert.equal(connectionPhase({ status: 'disposed' }).phase, 'offline');
  assert.equal(connectionPhase(undefined).phase, 'offline');
});

test('watchConnection reports status and only fires onReconnected after a real drop', () => {
  const client = fakeConnectionClient({ status: 'connected' });
  const phases = [];
  let reconnects = 0;
  const stop = watchConnection(client, {
    onStatus: (phase) => phases.push(phase.phase),
    onReconnected: () => { reconnects += 1; },
  });

  // Initial connected emission must not count as a reconnect.
  assert.deepEqual(phases, ['online']);
  assert.equal(reconnects, 0);

  client.emit({ status: 'disconnected', reason: 'socket closed' });
  client.emit({ status: 'connecting', attempt: 1 });
  assert.equal(reconnects, 0);

  client.emit({ status: 'connected' });
  assert.equal(reconnects, 1);

  // A second connected without a new drop must not re-fire.
  client.emit({ status: 'connected' });
  assert.equal(reconnects, 1);

  client.emit({ status: 'connecting', attempt: 1 });
  client.emit({ status: 'connected' });
  assert.equal(reconnects, 2);
  assert.deepEqual(phases, [
    'online', 'offline', 'connecting', 'online', 'online', 'connecting', 'online',
  ]);

  stop();
  assert.equal(client.listenerCount, 0);
});

test('watchConnection rejects clients without a status subscription', () => {
  assert.throws(() => watchConnection({}, {}), /不支持连接状态订阅/);
});

test('resyncAfterReconnect refetches the agent directory and current timeline', async () => {
  const calls = [];
  const client = {
    async fetchAgents(options) {
      calls.push(['agents', options]);
      return { entries: [{ agent: { id: 'agent-1' } }] };
    },
    async fetchAgentTimeline(agentId, options) {
      calls.push(['timeline', agentId, options]);
      return { entries: [{ item: {} }], agent: { id: agentId } };
    },
  };

  const result = await resyncAfterReconnect(client, { sessionId: 'agent-1' });
  assert.equal(result.agents.entries.length, 1);
  assert.equal(result.timeline.agent.id, 'agent-1');
  assert.deepEqual(calls, [
    ['agents', { page: { limit: 100 }, subscribe: {} }],
    ['timeline', 'agent-1', { direction: 'tail', limit: 200, projection: 'projected' }],
  ]);
});

test('resyncAfterReconnect skips the timeline without an open session and propagates errors', async () => {
  const result = await resyncAfterReconnect({
    async fetchAgents() {
      return { entries: [] };
    },
    async fetchAgentTimeline() {
      throw new Error('must not fetch timeline');
    },
  });
  assert.equal(result.timeline, null);

  await assert.rejects(
    () => resyncAfterReconnect({
      async fetchAgents() {
        throw new Error('daemon offline');
      },
    }, { sessionId: 'agent-1' }),
    /daemon offline/,
  );
});

test('draft store keeps unsent text per session and per server', () => {
  const storage = memoryStorage();
  const storeA = createDraftStore(storage, 'srv-a');
  const storeB = createDraftStore(storage, 'srv-b');

  storeA.save('agent-1', '还没发出去的话');
  storeA.save('agent-2', 'draft two');
  storeB.save('agent-1', 'other server');

  assert.equal(storeA.load('agent-1'), '还没发出去的话');
  assert.equal(storeA.load('agent-2'), 'draft two');
  assert.equal(storeB.load('agent-1'), 'other server');

  // Simulate a reload: a fresh store over the same storage sees the draft.
  assert.equal(createDraftStore(storage, 'srv-a').load('agent-1'), '还没发出去的话');

  storeA.clear('agent-1');
  assert.equal(storeA.load('agent-1'), '');
  storeA.save('agent-2', '');
  assert.equal(storeA.load('agent-2'), '');

  storeB.clearAll();
  assert.equal(createDraftStore(storage, 'srv-b').load('agent-1'), '');
});

test('draft store degrades to memory when storage is unavailable', () => {
  const broken = {
    getItem() { throw new Error('storage denied'); },
    setItem() { throw new Error('storage denied'); },
    removeItem() { throw new Error('storage denied'); },
  };
  const store = createDraftStore(broken, 'srv-a');
  store.save('agent-1', 'memory draft');
  assert.equal(store.load('agent-1'), 'memory draft');
  store.clearAll();
  assert.equal(store.load('agent-1'), '');
});
