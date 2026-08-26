'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const {
  DSH_IM_PACKAGE,
  DSH_IM_BEGIN,
  DSH_IM_END,
  ensureDesktopDshIm,
} = require('./dsh-im-desktop');

function makeSource(root) {
  const dir = path.join(root, 'source');
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: DSH_IM_PACKAGE,
    version: '3.0.1',
    main: './lib/index.js',
    exports: { '.': './lib/index.js', './client': './lib/client.js' },
    dependencies: {},
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'lib', 'index.js'), 'export const name = "@xmanrui/dsh-im"\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'lib', 'client.js'), 'export function apply() {}\n', 'utf8');
  return dir;
}

test('ensureDesktopDshIm inserts package-name cordis and junctions node_modules', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshd-im-'));
  try {
    const source = makeSource(root);
    const profileDir = path.join(root, 'profile');
    // Legacy soft-preset residue must be removed.
    const legacy = path.join(profileDir, 'desktop-plugins', '@xmanrui', 'dsh-im');
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, 'package.json'), '{"name":"stale"}\n', 'utf8');

    const result = ensureDesktopDshIm({ sourceDir: source, profileDir });
    assert.equal(result.ok, true);
    assert.equal(result.added, true);
    assert.equal(result.href, pathToFileURL(source).href);
    assert.equal(fs.existsSync(legacy), false);

    const linked = path.join(profileDir, 'node_modules', '@xmanrui', 'dsh-im');
    assert.equal(fs.existsSync(path.join(linked, 'package.json')), true);
    assert.equal(
      fs.readFileSync(path.join(linked, 'lib', 'index.js'), 'utf8'),
      'export const name = "@xmanrui/dsh-im"\n',
    );

    const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    assert.match(patch, new RegExp(DSH_IM_BEGIN));
    assert.match(patch, new RegExp(DSH_IM_END));
    assert.match(patch, /@xmanrui\/dsh-im/);
    assert.doesNotMatch(patch, /file:\/\//);
    assert.doesNotMatch(patch, /desktop-plugins/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ensureDesktopDshIm fails closed when the bundled package is missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshd-im-miss-'));
  try {
    const profileDir = path.join(root, 'profile');
    const result = ensureDesktopDshIm({
      sourceDir: path.join(root, 'missing'),
      profileDir,
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /missing-source/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ensureDesktopDshIm fails closed on incomplete node_modules without stripping', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshd-im-deps-'));
  try {
    const source = path.join(root, 'source');
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({
      name: DSH_IM_PACKAGE,
      version: '3.0.1',
      main: './lib/index.js',
      dependencies: { 'missing-dep-xyz': '1.0.0' },
    }), 'utf8');
    const profileDir = path.join(root, 'profile');
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(
      path.join(profileDir, 'cordis.patch.yml'),
      `${DSH_IM_BEGIN}\n- insert:\n    - id: xmanrui-dsh-im\n      name: "stale"\n${DSH_IM_END}\n`,
      'utf8',
    );
    const result = ensureDesktopDshIm({ sourceDir: source, profileDir });
    assert.equal(result.ok, false);
    assert.match(result.error, /missing-source:node_modules/);
    const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    assert.match(patch, new RegExp(DSH_IM_BEGIN));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ensureDesktopDshIm skips when disabled', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dshd-im-off-'));
  try {
    const source = makeSource(root);
    const profileDir = path.join(root, 'profile');
    const result = ensureDesktopDshIm({
      sourceDir: source,
      profileDir,
      disabledPlugins: [DSH_IM_PACKAGE],
    });
    assert.equal(result.ok, true);
    assert.equal(result.disabled, true);
    assert.equal(fs.existsSync(path.join(profileDir, 'desktop-plugins', '@xmanrui', 'dsh-im')), false);
    assert.equal(fs.existsSync(path.join(profileDir, 'cordis.patch.yml')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
