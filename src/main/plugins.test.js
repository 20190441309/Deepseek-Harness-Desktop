'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const {
  ensureDesktopInstallPlugin,
  DESKTOP_INSTALL_BEGIN,
  DESKTOP_INSTALL_END,
  LEGACY_DESKTOP_INSTALL_BEGIN,
  LEGACY_DESKTOP_INSTALL_END,
} = require('./plugins');

function sourceDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-host-'));
  fs.writeFileSync(path.join(dir, 'install-dsh-plugin.mjs'), 'export const name = "dshd-desktop-plugin-install"\n', 'utf8');
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
    assert.ok(patch.includes('id: dshd-desktop-plugin-install'));
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
    assert.match(patch, /\n- insert:\n {4}- id: dshd-desktop-plugin-install/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('ensureDesktopInstallPlugin strips the legacy desktop-install patch block', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = sourceDir();
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    fs.mkdirSync(profileDir, { recursive: true });
    const href = 'file:///C:/Users/test/.dsh/profiles/web/desktop-plugins/install-dsh-plugin/install-dsh-plugin.mjs';
    fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), [
      '- id: message-edit',
      '  disabled: true',
      '',
      LEGACY_DESKTOP_INSTALL_BEGIN,
      '- insert:',
      '    - id: dsh-desktop-plugin-install',
      `      name: "${href}"`,
      LEGACY_DESKTOP_INSTALL_END,
      '',
      DESKTOP_INSTALL_BEGIN,
      '- insert:',
      '    - id: dshd-desktop-plugin-install',
      `      name: "${href}"`,
      DESKTOP_INSTALL_END,
      '',
    ].join('\n'), 'utf8');
    const result = ensureDesktopInstallPlugin({ sourceDir: source, profileDir });
    assert.equal(result.ok, true);
    assert.equal(result.patchChanged, true);
    const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    assert.equal(patch.includes(LEGACY_DESKTOP_INSTALL_BEGIN), false);
    assert.equal(patch.includes('id: dsh-desktop-plugin-install'), false);
    assert.equal(patch.split('install-dsh-plugin.mjs').length - 1, 1);
    assert.ok(patch.includes(DESKTOP_INSTALL_BEGIN));
    assert.ok(patch.includes('id: dshd-desktop-plugin-install'));
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

function copyRealPlugin(dir) {
  const hostDir = path.join(__dirname, '..', 'host');
  fs.copyFileSync(path.join(hostDir, 'install-dsh-plugin.mjs'), path.join(dir, 'install-dsh-plugin.mjs'));
  fs.copyFileSync(
    path.join(hostDir, 'install-dsh-plugin-client.js'),
    path.join(dir, 'install-dsh-plugin-client.js'),
  );
  return pathToFileURL(path.join(dir, 'install-dsh-plugin.mjs')).href;
}

describe('desktop install plugin module', { concurrency: false }, () => {
  test('a $DSH_HOME copy of the desktop plugin loads without a static dsh-tools import', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-plugin-iso-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const previous = {
      DSH_DESKTOP_INSTALL_URL: process.env.DSH_DESKTOP_INSTALL_URL,
      DSH_DESKTOP_INSTALL_TOKEN: process.env.DSH_DESKTOP_INSTALL_TOKEN,
      DSH_HARNESS_ROOT: process.env.DSH_HARNESS_ROOT,
    };
    t.after(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    delete process.env.DSH_DESKTOP_INSTALL_URL;
    delete process.env.DSH_DESKTOP_INSTALL_TOKEN;
    delete process.env.DSH_HARNESS_ROOT;
    const mod = await import(copyRealPlugin(dir));
    assert.equal(mod.name, 'dshd-desktop-plugin-install');
    let registered = false;
    await mod.apply({ tools: { register() { registered = true; } } });
    assert.equal(registered, false);

    process.env.DSH_DESKTOP_INSTALL_URL = 'http://127.0.0.1:1';
    process.env.DSH_DESKTOP_INSTALL_TOKEN = 'token';
    const errors = [];
    const previousError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); };
    try {
      await mod.apply({ tools: { register() { registered = true; } } });
    } finally {
      console.error = previousError;
    }
    assert.equal(registered, false);
    assert.match(errors.join('\n'), /skipped install_dsh_plugin/);
  });

  test('the desktop plugin registers install_dsh_plugin from DSH_HARNESS_ROOT', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-plugin-root-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const previous = {
      DSH_DESKTOP_INSTALL_URL: process.env.DSH_DESKTOP_INSTALL_URL,
      DSH_DESKTOP_INSTALL_TOKEN: process.env.DSH_DESKTOP_INSTALL_TOKEN,
      DSH_HARNESS_ROOT: process.env.DSH_HARNESS_ROOT,
    };
    t.after(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    process.env.DSH_DESKTOP_INSTALL_URL = 'http://127.0.0.1:1';
    process.env.DSH_DESKTOP_INSTALL_TOKEN = 'token';
    process.env.DSH_HARNESS_ROOT = path.join(__dirname, '..', '..', 'vendor', 'deepseek-harness');
    const mod = await import(copyRealPlugin(dir));
    const tools = [];
    await mod.apply({ tools: { register(tool) { tools.push(tool); } } });
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, 'install_dsh_plugin');
  });
});
