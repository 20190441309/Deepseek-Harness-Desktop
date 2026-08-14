const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { createPtyController } = require('./pty.js');

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
