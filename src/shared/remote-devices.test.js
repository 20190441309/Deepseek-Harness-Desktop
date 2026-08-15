const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deviceName,
  normalizeDevices,
  publicDevices,
  createDevice,
} = require('./remote-devices');

test('deviceName maps common user agents and falls back to 手机', () => {
  assert.equal(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), 'iPhone');
  assert.equal(deviceName('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'), 'iPad');
  assert.equal(deviceName('Mozilla/5.0 (Linux; Android 14)'), 'Android');
  assert.equal(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'Windows');
  assert.equal(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'), 'Mac');
  assert.equal(deviceName('Mozilla/5.0 (X11; Linux x86_64)'), 'Linux');
  assert.equal(deviceName(''), '手机');
});

test('normalizeDevices drops junk and duplicate ids, publicDevices strips tokens', () => {
  const devices = normalizeDevices([
    null,
    { id: 'a', token: 'secret-a', name: 'iPhone', createdAt: 't1', lastSeenAt: 't2' },
    { id: 'a', token: 'dup', name: 'ignored' },
    { id: 'b', token: 'secret-b' },
    { name: 'no-id' },
  ]);
  assert.equal(devices.length, 2);
  assert.equal(devices[1].name, '手机');
  const pub = publicDevices(devices, ['b']);
  assert.equal(pub[0].online, false);
  assert.equal(pub[1].online, true);
  assert.equal('token' in pub[0], false);
});

test('createDevice mints an id and names from the user agent', () => {
  const device = createDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', 'tok');
  assert.match(device.id, /^[0-9a-f]{16}$/);
  assert.equal(device.token, 'tok');
  assert.equal(device.name, 'iPhone');
  assert.equal(device.createdAt, device.lastSeenAt);
});
