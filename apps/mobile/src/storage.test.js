const test = require('node:test');
const assert = require('node:assert/strict');
const { createDeviceStore, memoryStore } = require('./storage');

test('round-trips a device secret and clears it', async () => {
  const store = createDeviceStore(memoryStore());
  assert.equal(await store.load(), null);
  await store.save({ deviceId: 'dev_1', deviceSecretB64: 'secret' });
  assert.deepEqual(await store.load(), { deviceId: 'dev_1', deviceSecretB64: 'secret' });
  await store.clear();
  assert.equal(await store.load(), null);
});

test('treats unreadable stored JSON as empty', async () => {
  const backend = memoryStore();
  await backend.setItem('dshd.remote.device', '{not-json');
  const store = createDeviceStore(backend);
  assert.equal(await store.load(), null);
});
