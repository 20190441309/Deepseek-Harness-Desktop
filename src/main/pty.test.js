const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { BACKEND_UNAVAILABLE, createPtyController, registerPtyIpc } = require('./pty.js');

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

  const created = await pty.create({ cwd: os.tmpdir() });
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
    () => pty.create({ cwd: os.tmpdir() }),
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
    () => pty.create({ cwd: os.tmpdir() }),
    { message: BACKEND_UNAVAILABLE },
  );
});
