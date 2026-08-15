const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorkspaceAuthority } = require('./workspace-authority');
const { BACKEND_UNAVAILABLE, createPtyController, registerPtyIpc, setWorkspaceAuthority } = require('./pty.js');

// One shared workspace root for the whole suite; cwd checks resolve inside it.
const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-pty-ws-'));
setWorkspaceAuthority(createWorkspaceAuthority({ workspace: ws }));

function fakeSpawn() {
  return ({ onData, onExit }) => ({
    write(data) {
      onData(data);
    },
    resize() {},
    kill() {
      onExit(0);
    },
  });
}

test('ptyCreate write echoes through onPtyData then ptyKill emits exit', async () => {
  const events = [];
  const pty = createPtyController({
    spawn: fakeSpawn(),
    emit(channel, payload) {
      events.push({ channel, payload });
    },
  });

  const created = await pty.create({ cwd: ws });
  assert.equal(typeof created.id, 'string');
  assert.ok(created.id.length > 0);

  await pty.write(created.id, 'echo');
  assert.deepEqual(
    events.filter((event) => event.channel === 'shell:pty-data'),
    [{ channel: 'shell:pty-data', payload: { id: created.id, data: 'echo' } }],
  );

  await pty.kill(created.id);
  assert.deepEqual(
    events.filter((event) => event.channel === 'shell:pty-exit'),
    [{ channel: 'shell:pty-exit', payload: { id: created.id, code: 0 } }],
  );
});

test('ptyCreate rejects a missing project cwd', async () => {
  const pty = createPtyController({ spawn: fakeSpawn(), emit() {} });
  await assert.rejects(() => pty.create({ cwd: '' }), /cwd/);
  await assert.rejects(() => pty.create({}), /cwd/);
});

test('createPtyController does not load node-pty until create', () => {
  assert.doesNotThrow(() => createPtyController({ emit() {} }));
});

test('registerPtyIpc succeeds when the PTY backend is unavailable', async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, fn) {
      handlers.set(channel, fn);
    },
  };
  const pty = createPtyController({ spawn: null, emit() {} });
  assert.doesNotThrow(() => registerPtyIpc(ipcMain, pty));
  assert.equal(typeof handlers.get('shell:pty-create'), 'function');
  assert.equal(typeof handlers.get('shell:pty-write'), 'function');
  assert.equal(typeof handlers.get('shell:pty-resize'), 'function');
  assert.equal(typeof handlers.get('shell:pty-kill'), 'function');
  await assert.rejects(
    () => pty.create({ cwd: ws }),
    { message: BACKEND_UNAVAILABLE },
  );
});

test('ptyCreate maps a throwing spawn factory to the stable unavailable result', async () => {
  const pty = createPtyController({
    spawn() {
      throw new Error('node-pty is not available');
    },
    emit() {},
  });
  await assert.rejects(
    () => pty.create({ cwd: ws }),
    { message: BACKEND_UNAVAILABLE },
  );
});

test('killAll tears down every session and clears the table', async () => {
  const pty = createPtyController({ spawn: fakeSpawn(), emit() {} });
  const a = await pty.create({ cwd: ws });
  const b = await pty.create({ cwd: ws });
  pty.killAll();
  await assert.rejects(() => pty.write(a.id, 'x'), /unknown pty id/);
  await assert.rejects(() => pty.write(b.id, 'x'), /unknown pty id/);
});

test('registerPtyIpc returns the live controller for lifecycle wiring', () => {
  const handlers = new Map();
  const ipcMain = { handle(channel, fn) { handlers.set(channel, fn); } };
  const pty = createPtyController({ spawn: fakeSpawn(), emit() {} });
  const returned = registerPtyIpc(ipcMain, pty);
  assert.equal(returned, pty);
});
