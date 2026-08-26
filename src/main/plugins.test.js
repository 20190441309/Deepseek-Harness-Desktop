'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const {
  ensureDesktopInstallPlugin,
  healDanglingBundles,
  applyDisabledBundles,
  webProfileDir,
  DESKTOP_INSTALL_BEGIN,
  DESKTOP_INSTALL_END,
  LEGACY_DESKTOP_INSTALL_BEGIN,
  LEGACY_DESKTOP_INSTALL_END,
} = require('./plugins');
const { setDesktopDshHome, clearDesktopDshHome } = require('../shared/dsh-home');

test('webProfileDir lives under the desktop home, not ~/.dsh', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  setDesktopDshHome(home);
  try {
    assert.equal(webProfileDir(), path.join(home, 'profiles', 'web'));
  } finally {
    clearDesktopDshHome();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('healDanglingBundles removes only unresolved user bundles and preserves dependencies', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const install = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-install-'));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    const installPackage = path.join(install, 'apps', 'cli', 'package.json');
    const installed = path.join(install, 'apps', 'cli', 'node_modules', 'from-install');
    fs.mkdirSync(path.dirname(installPackage), { recursive: true });
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(installPackage, '{}\n', 'utf8');
    fs.writeFileSync(path.join(installed, 'package.json'), '{"name":"from-install"}\n', 'utf8');
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'package.json'), `${JSON.stringify({
      dependencies: { 'from-install': '1.0.0', ghost: '1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'from-install', 'ghost'] } },
    }, null, 2)}\n`, 'utf8');

    const result = healDanglingBundles({ profileDir, installAnchor: installPackage });
    assert.equal(result.ok, true);
    assert.deepEqual(result.removed, ['ghost']);
    const manifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
    assert.deepEqual(manifest.dsh.profile.bundles, ['@deepseek-ai/dsh-base', 'from-install']);
    assert.equal(manifest.dependencies.ghost, '1.0.0');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(install, { recursive: true, force: true });
  }
});

test('applyDisabledBundles drops a user bundle and keeps the official template', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'package.json'), `${JSON.stringify({
      dependencies: { 'user-pack': '1.0.0', '@deepseek-ai/dsh-base': '1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'user-pack'] } },
    }, null, 2)}\n`, 'utf8');
    setDesktopDshHome(home);
    const result = applyDisabledBundles(['user-pack', '@deepseek-ai/dsh-base']);
    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.ok(!result.bundles.includes('user-pack'));
    assert.ok(result.bundles.includes('@deepseek-ai/dsh-base'));
    const manifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
    assert.deepEqual(manifest.dsh.profile.bundles, ['@deepseek-ai/dsh-base']);
  } finally {
    clearDesktopDshHome();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

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

test('ensureDesktopInstallPlugin writes a skip overlay holding only the install insert', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = sourceDir();
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    // A profile user layer with a user row that skip mode must not resurrect.
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), [
      '- insert:',
      '    - id: broken-user-plugin',
      '      name: "some-broken-user-plugin"',
      '',
    ].join('\n'), 'utf8');
    const result = ensureDesktopInstallPlugin({ sourceDir: source, profileDir });
    assert.equal(result.ok, true);
    assert.equal(
      result.skipPatchFile,
      path.join(profileDir, 'desktop-plugins', 'install-dsh-plugin', 'skip-user-plugins.patch.yml'),
    );
    const overlay = fs.readFileSync(result.skipPatchFile, 'utf8');
    assert.ok(overlay.includes('id: dshd-desktop-plugin-install'));
    assert.ok(overlay.includes(result.href));
    assert.equal(overlay.includes('broken-user-plugin'), false);
    assert.equal(overlay.includes(DESKTOP_INSTALL_BEGIN), false);
    // Idempotent: unchanged content is not rewritten with a different value.
    const again = ensureDesktopInstallPlugin({ sourceDir: source, profileDir });
    assert.equal(fs.readFileSync(again.skipPatchFile, 'utf8'), overlay);
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

/** A harness tree whose `@deepseek-ai/dsh-tools` resolves without `pnpm install`. */
function makeFakeHarnessRoot(dir) {
  const toolsDir = path.join(dir, 'node_modules', '@deepseek-ai', 'dsh-tools');
  fs.mkdirSync(path.join(dir, 'apps', 'cli'), { recursive: true });
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'apps', 'cli', 'package.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(toolsDir, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-tools',
    version: '0.0.0',
    type: 'module',
    exports: { '.': './index.js' },
  }), 'utf8');
  fs.writeFileSync(path.join(toolsDir, 'index.js'), 'export function defineTool(tool) { return tool }\n', 'utf8');
  return dir;
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
    const harness = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-harness-root-'));
    t.after(() => fs.rmSync(harness, { recursive: true, force: true }));
    process.env.DSH_HARNESS_ROOT = makeFakeHarnessRoot(harness);
    const mod = await import(copyRealPlugin(dir));
    const tools = [];
    await mod.apply({ tools: { register(tool) { tools.push(tool); } } });
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, 'install_dsh_plugin');
  });
});
