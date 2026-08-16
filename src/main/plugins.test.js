'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  ensureDesktopInstallPlugin,
  DESKTOP_INSTALL_BEGIN,
  DESKTOP_INSTALL_END,
} = require('./plugins');

function sourceDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-host-'));
  fs.writeFileSync(path.join(dir, 'install-dsh-plugin.mjs'), 'export const name = "dsh-desktop-plugin-install"\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'install-dsh-plugin-client.js'), 'module.exports = {}\n', 'utf8');
  return dir;
}

test('ensureDesktopInstallPlugin copies the Host plugin and upserts the managed patch', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = sourceDir();
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    const first = ensureDesktopInstallPlugin({ sourceDir: source, profileDir });
    assert.equal(first.ok, true);
    const dest = path.join(profileDir, 'desktop-plugins', 'install-dsh-plugin');
    assert.equal(fs.existsSync(path.join(dest, 'install-dsh-plugin.mjs')), true);
    const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    assert.ok(patch.includes(DESKTOP_INSTALL_BEGIN));
    assert.ok(patch.includes(DESKTOP_INSTALL_END));
    assert.ok(patch.includes('id: dsh-desktop-plugin-install'));
    assert.ok(patch.includes(first.href));
    fs.writeFileSync(path.join(source, 'install-dsh-plugin.mjs'), 'export const name = "updated"\n', 'utf8');
    ensureDesktopInstallPlugin({ sourceDir: source, profileDir });
    assert.equal(fs.readFileSync(path.join(dest, 'install-dsh-plugin.mjs'), 'utf8'), 'export const name = "updated"\n');
    const again = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    assert.equal(again.split(DESKTOP_INSTALL_BEGIN).length, 2);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('ensureDesktopInstallPlugin replaces the shipped empty [] patch instead of appending', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = sourceDir();
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), [
      '# Your patch layer for this dsh profile, applied after every bundle layer:',
      '# a top-level YAML array of loader patch entries (id-targeted config',
      '# overrides, disables, and insert lists; `!!js` expressions allowed).',
      '[]',
      '',
    ].join('\n'), 'utf8');
    ensureDesktopInstallPlugin({ sourceDir: source, profileDir });
    const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    assert.equal(/^\s*\[\]\s*$/m.test(patch), false);
    assert.match(patch, /^# Your patch layer/m);
    assert.match(patch, /\n- insert:\n {4}- id: dsh-desktop-plugin-install/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('ensureDesktopInstallPlugin fails closed when a source file is missing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-host-missing-'));
  try {
    const result = ensureDesktopInstallPlugin({
      sourceDir: source,
      profileDir: path.join(home, 'profiles', 'web'),
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /missing-source:/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});
