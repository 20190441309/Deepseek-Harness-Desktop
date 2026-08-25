'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const avatarUrl = pathToFileURL(
  path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'lib', 'avatar.js'),
).href;

async function loadAvatar() {
  return import(avatarUrl);
}

test('defaultBlobAvatar is stable for the same seed', async () => {
  const { defaultBlobAvatar } = await loadAvatar();
  assert.deepEqual(defaultBlobAvatar('翻译官'), defaultBlobAvatar('翻译官'));
});

test('defaultBlobAvatar picks a known shape and color', async () => {
  const { defaultBlobAvatar, BLOB_SHAPES, BLOB_COLORS } = await loadAvatar();
  const avatar = defaultBlobAvatar('算术助手');
  assert.equal(avatar.kind, 'blob');
  assert.ok(BLOB_SHAPES.includes(avatar.shape));
  assert.ok(BLOB_COLORS.includes(avatar.color));
});

test('defaultBlobAvatar can differ across seeds', async () => {
  const { defaultBlobAvatar } = await loadAvatar();
  const a = defaultBlobAvatar('翻译官');
  const b = defaultBlobAvatar('a-different-bot-id');
  assert.notDeepEqual(a, b);
});

test('normalizeAvatar falls back to a hashed blob when raw is missing', async () => {
  const { normalizeAvatar, defaultBlobAvatar } = await loadAvatar();
  assert.deepEqual(normalizeAvatar(undefined, '翻译官'), defaultBlobAvatar('翻译官'));
  assert.deepEqual(normalizeAvatar({ kind: 'nope' }, 'x'), defaultBlobAvatar('x'));
});

test('normalizeAvatar keeps a valid blob', async () => {
  const { normalizeAvatar } = await loadAvatar();
  const raw = { kind: 'blob', shape: 'cloud', color: 'teal' };
  assert.deepEqual(normalizeAvatar(raw, 'ignored'), raw);
});

test('normalizeAvatar rejects an unknown blob shape', async () => {
  const { normalizeAvatar, defaultBlobAvatar } = await loadAvatar();
  assert.deepEqual(
    normalizeAvatar({ kind: 'blob', shape: 'robot', color: 'teal' }, 'seed'),
    defaultBlobAvatar('seed'),
  );
});

test('normalizeAvatar keeps a valid image', async () => {
  const { normalizeAvatar } = await loadAvatar();
  const raw = { kind: 'image', dataUrl: 'data:image/jpeg;base64,aaaa', crop: 'square' };
  assert.deepEqual(normalizeAvatar(raw, 'ignored'), raw);
});

test('assertImageAvatar accepts a short jpeg data URL', async () => {
  const { assertImageAvatar } = await loadAvatar();
  assert.deepEqual(
    assertImageAvatar('data:image/jpeg;base64,aaaa', 'circle'),
    { kind: 'image', dataUrl: 'data:image/jpeg;base64,aaaa', crop: 'circle' },
  );
});

test('assertImageAvatar rejects a non-image URL', async () => {
  const { assertImageAvatar } = await loadAvatar();
  assert.throws(
    () => assertImageAvatar('https://example.com/a.png', 'circle'),
    /jpeg or png data URL/,
  );
});

test('assertImageAvatar rejects an oversized data URL', async () => {
  const { assertImageAvatar, IMAGE_AVATAR_MAX_CHARS } = await loadAvatar();
  const dataUrl = `data:image/png;base64,${'a'.repeat(IMAGE_AVATAR_MAX_CHARS)}`;
  assert.throws(() => assertImageAvatar(dataUrl, 'circle'), /too large/);
});

function pathAnchors(d) {
  const cmds = String(d).match(/[MC][^MCZ]+/g) || [];
  return cmds.map((cmd) => {
    const nums = cmd.trim().slice(1).trim().split(/\s+/).map(Number);
    return { x: nums[nums.length - 2], y: nums[nums.length - 1] };
  });
}

test('blobPath rest and squash share the same command count', async () => {
  const { blobPath, BLOB_SHAPES } = await loadAvatar();
  for (const shape of BLOB_SHAPES) {
    const rest = blobPath(shape, 0);
    const squash = blobPath(shape, 1);
    const stretch = blobPath(shape, -1);
    const lean = blobPath(shape, 0, 1);
    assert.equal(rest.split(/[MCZ]/).length, squash.split(/[MCZ]/).length);
    assert.equal(rest.split(/[MCZ]/).length, stretch.split(/[MCZ]/).length);
    assert.equal(rest.split(/[MCZ]/).length, lean.split(/[MCZ]/).length);
    assert.match(rest, /^M /);
    assert.match(rest, /Z$/);
  }
});

test('blobPath squash=1 flattens the top and bulges the sides', async () => {
  const { blobPath } = await loadAvatar();
  const [top, , right] = pathAnchors(blobPath('circle', 1));
  assert.ok(32 - top.y <= 12, `top should pancake toward center, y=${top.y}`);
  assert.ok(right.x >= 59, `sides should bulge outward, x=${right.x}`);
});

test('blobPath squash=-1 stretches taller and tucks the sides', async () => {
  const { blobPath } = await loadAvatar();
  const [top, , right] = pathAnchors(blobPath('circle', -1));
  assert.ok(top.y <= 8, `top should stretch upward, y=${top.y}`);
  assert.ok(right.x <= 50, `sides should tuck in, x=${right.x}`);
});

test('blobPath lean shears the top sideways', async () => {
  const { blobPath } = await loadAvatar();
  const [top] = pathAnchors(blobPath('circle', 0, 1));
  assert.ok(Math.abs(top.x - 32) >= 5, `lean should move the top, x=${top.x}`);
});

test('client.js avatar copy stays in lockstep with lib/avatar.js', async () => {
  const fs = require('fs');
  const { BLOB_SHAPES, BLOB_COLORS, BLOB_SHAPE_RADII } = await loadAvatar();
  const clientSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'client', 'client.js'),
    'utf8',
  );
  const shapesMatch = clientSrc.match(/const BLOB_SHAPES = (\[[^\]]*\])/);
  const colorsMatch = clientSrc.match(/const BLOB_COLORS = (\[[^\]]*\])/);
  assert.ok(shapesMatch, 'client.js must declare BLOB_SHAPES');
  assert.ok(colorsMatch, 'client.js must declare BLOB_COLORS');
  assert.deepEqual(JSON.parse(shapesMatch[1]), [...BLOB_SHAPES]);
  assert.deepEqual(JSON.parse(colorsMatch[1]), [...BLOB_COLORS]);
  for (const [shape, radii] of Object.entries(BLOB_SHAPE_RADII)) {
    assert.ok(
      clientSrc.includes(`${shape}: [${radii.join(', ')}]`),
      `client.js BLOB_SHAPE_RADII.${shape} must match lib/avatar.js`,
    );
  }
});
