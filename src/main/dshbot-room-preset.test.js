'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const roomPresetUrl = pathToFileURL(
  path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'lib', 'room-preset.js'),
).href;

test('ensureRoomPreset provisions .agent-presets/dshbot-room from the package', async () => {
  const { ensureRoomPreset, ROOM_PRESET_ID } = await import(roomPresetUrl);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dshbot-home-'));
  try {
    const result = ensureRoomPreset(home);
    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    const destDir = path.join(home, '.agent-presets', ROOM_PRESET_ID);
    assert.equal(result.destDir, destDir);
    assert.equal(fs.existsSync(path.join(destDir, 'agent.cordis.yml')), true);
    assert.equal(fs.existsSync(path.join(destDir, 'preset.yml')), true);
    // Second run is idempotent.
    const again = ensureRoomPreset(home);
    assert.equal(again.ok, true);
    assert.equal(again.changed, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('ensureRoomPreset refreshes byte-different files on upgrade', async () => {
  const { ensureRoomPreset, ROOM_PRESET_ID, roomPresetSourceDir } = await import(roomPresetUrl);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dshbot-home-'));
  try {
    ensureRoomPreset(home);
    const dest = path.join(home, '.agent-presets', ROOM_PRESET_ID, 'agent.cordis.yml');
    fs.writeFileSync(dest, '# stale\n', 'utf8');
    const result = ensureRoomPreset(home);
    assert.equal(result.changed, true);
    const expected = fs.readFileSync(
      path.join(roomPresetSourceDir(), 'agent.cordis.yml'),
      'utf8',
    );
    assert.equal(fs.readFileSync(dest, 'utf8'), expected);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('ensureRoomPreset fails soft without a home or source', async () => {
  const { ensureRoomPreset } = await import(roomPresetUrl);
  assert.deepEqual(ensureRoomPreset(''), { ok: false, error: 'missing-home' });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dshbot-home-'));
  const emptySource = fs.mkdtempSync(path.join(os.tmpdir(), 'dshbot-empty-src-'));
  try {
    const result = ensureRoomPreset(home, emptySource);
    assert.equal(result.ok, false);
    assert.match(result.error, /missing-source/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(emptySource, { recursive: true, force: true });
  }
});

test('apply provisions the room preset before registering tools', () => {
  const indexSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'lib', 'index.js'),
    'utf8',
  );
  assert.match(indexSrc, /ensureRoomPreset\(dshHomeDir\(\)\)/);
});
