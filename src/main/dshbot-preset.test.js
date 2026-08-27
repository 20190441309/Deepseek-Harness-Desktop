'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DSHBOT_BEGIN,
  DSHBOT_END,
  isDshbotPresetEnabled,
  ensureDshbotPlugin,
  removeDshbotPreset,
} = require('./dshbot-preset');

test('dshbot dev preset is config opt-in and off by default', () => {
  assert.equal(isDshbotPresetEnabled(undefined), false);
  assert.equal(isDshbotPresetEnabled({}), false);
  assert.equal(isDshbotPresetEnabled({ dshbotPreset: 'yes' }), false);
  assert.equal(isDshbotPresetEnabled({ dshbotPreset: true }), true);
});

function writeSource(dir) {
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'client'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'presets', 'dshbot-room'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({
    name: 'dshbot',
    version: '0.2.0',
    type: 'module',
    main: 'lib/index.js',
    exports: {
      '.': './lib/index.js',
      './ask-participant': './lib/ask-participant.js',
      './client': './client/client.js',
    },
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      client: { platform: 'web', inject: [] },
    },
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'lib', 'index.js'), 'export const name = "dsh-bot"\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'client', 'client.js'), 'export function apply() {}\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: dsh-bot',
    "      name: 'dshbot'",
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(
    path.join(dir, 'presets', 'dshbot-room', 'agent.cordis.yml'),
    '- id: persona\n  name: \'@deepseek-ai/dsh-persona\'\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'presets', 'dshbot-room', 'preset.yml'),
    'name: 群聊主持\n',
    'utf8',
  );
  return dir;
}

test('ensureDshbotPlugin copies the package and inserts a managed patch, but no preset', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = writeSource(fs.mkdtempSync(path.join(os.tmpdir(), 'dshbot-src-')));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    const result = ensureDshbotPlugin({ sourceDir: source, profileDir });
    assert.equal(result.ok, true);
    assert.equal(result.added, true);
    const dest = path.join(profileDir, 'desktop-plugins', 'dshbot');
    assert.equal(fs.readFileSync(path.join(dest, 'lib', 'index.js'), 'utf8'), 'export const name = "dsh-bot"\n');
    assert.equal(fs.existsSync(path.join(dest, 'client', 'client.js')), true);
    const linked = path.join(profileDir, 'node_modules', 'dshbot');
    assert.equal(fs.existsSync(path.join(linked, 'package.json')), true);
    const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    assert.ok(patch.includes(DSHBOT_BEGIN));
    assert.ok(patch.includes(DSHBOT_END));
    assert.ok(patch.includes('id: dsh-bot'));
    assert.match(patch, /name: ['"]dshbot['"]/);
    // The plugin provisions its own room preset at apply time; the desktop
    // shell no longer copies it.
    assert.equal(fs.existsSync(path.join(home, '.agent-presets', 'dshbot-room')), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('ensureDshbotPlugin refreshes the dev copy on later starts', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = writeSource(fs.mkdtempSync(path.join(os.tmpdir(), 'dshbot-src-')));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    ensureDshbotPlugin({ sourceDir: source, profileDir });
    fs.writeFileSync(path.join(source, 'lib', 'index.js'), 'export const name = "updated"\n', 'utf8');
    const again = ensureDshbotPlugin({ sourceDir: source, profileDir });
    assert.equal(again.ok, true);
    assert.equal(again.added, false);
    const dest = path.join(profileDir, 'desktop-plugins', 'dshbot', 'lib', 'index.js');
    assert.equal(fs.readFileSync(dest, 'utf8'), 'export const name = "updated"\n');
    const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    assert.equal(patch.split(DSHBOT_BEGIN).length, 2);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('ensureDshbotPlugin skips the patch insert when the profile already lists the bundle', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = writeSource(fs.mkdtempSync(path.join(os.tmpdir(), 'dshbot-src-')));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'package.json'), `${JSON.stringify({
      dependencies: { dshbot: '0.2.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-web-app', 'dshbot'] } },
    }, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), [
      DSHBOT_BEGIN,
      '- insert:',
      '    - id: dsh-bot',
      '      name: "dshbot"',
      DSHBOT_END,
      '',
    ].join('\n'), 'utf8');
    const result = ensureDshbotPlugin({ sourceDir: source, profileDir });
    assert.equal(result.ok, true);
    assert.equal(result.added, false);
    const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    assert.equal(patch.includes(DSHBOT_BEGIN), false);
    assert.equal(patch.includes('id: dsh-bot'), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('ensureDshbotPlugin does not replace a pnpm-installed dshbot directory', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = writeSource(fs.mkdtempSync(path.join(os.tmpdir(), 'dshbot-src-')));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    const installed = path.join(profileDir, 'node_modules', 'dshbot');
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(installed, 'package.json'), '{"name":"dshbot","version":"9.9.9"}\n', 'utf8');
    ensureDshbotPlugin({ sourceDir: source, profileDir });
    assert.equal(JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8')).version, '9.9.9');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('ensureDshbotPlugin does not replace an external pnpm symlink install', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = writeSource(fs.mkdtempSync(path.join(os.tmpdir(), 'dshbot-src-')));
  const pnpmStore = writeSource(fs.mkdtempSync(path.join(os.tmpdir(), 'dshbot-pnpm-')));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    const linked = path.join(profileDir, 'node_modules', 'dshbot');
    fs.mkdirSync(path.dirname(linked), { recursive: true });
    fs.symlinkSync(pnpmStore, linked, process.platform === 'win32' ? 'junction' : 'dir');
    ensureDshbotPlugin({ sourceDir: source, profileDir });
    assert.ok(fs.lstatSync(linked).isSymbolicLink());
    assert.equal(
      fs.realpathSync(linked),
      fs.realpathSync(pnpmStore),
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(linked, 'package.json'), 'utf8')).version,
      '0.2.0',
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(pnpmStore, { recursive: true, force: true });
  }
});

test('ensureDshbotPlugin fails closed when the workspace package is missing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'dshbot-missing-'));
  try {
    const result = ensureDshbotPlugin({
      sourceDir: source,
      profileDir: path.join(home, 'profiles', 'web'),
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /missing-source/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('repo keeps the standalone dshbot package publishable', () => {
  const root = path.join(__dirname, '..', '..', 'vendor', 'dshbot');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'dshbot');
  assert.equal(pkg.private, undefined);
  assert.equal(typeof pkg.repository, 'object');
  assert.ok(Array.isArray(pkg.files) && pkg.files.includes('presets'));
  assert.equal(fs.existsSync(path.join(root, 'client', 'client.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'lib', 'index.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'lib', 'room-preset.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'cordis.patch.yml')), true);
  assert.equal(fs.existsSync(path.join(root, 'presets', 'dshbot-room', 'agent.cordis.yml')), true);
  // The unwired parallel orchestrator stays deleted.
  assert.equal(fs.existsSync(path.join(root, 'lib', 'group-chat-orchestrator.js')), false);
  assert.equal(JSON.stringify(pkg.exports).includes('group-chat-orchestrator'), false);
});

test('removeDshbotPreset removes patch block, copy, link, and orphan preset', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = writeSource(fs.mkdtempSync(path.join(os.tmpdir(), 'dshbot-src-')));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    ensureDshbotPlugin({ sourceDir: source, profileDir });
    // Simulate the plugin's self-provisioned preset from an earlier run.
    const presetDir = path.join(home, '.agent-presets', 'dshbot-room');
    fs.mkdirSync(presetDir, { recursive: true });
    fs.writeFileSync(path.join(presetDir, 'agent.cordis.yml'), '- id: persona\n', 'utf8');
    const result = removeDshbotPreset({ profileDir });
    assert.equal(result.ok, true);
    assert.equal(result.stripped, true);
    assert.equal(result.removedCopy, true);
    assert.equal(result.removedLink, true);
    assert.equal(result.removedPreset, true);
    assert.equal(result.changed, true);
    const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    assert.equal(patch.includes(DSHBOT_BEGIN), false);
    assert.equal(patch.includes('id: dsh-bot'), false);
    assert.equal(fs.existsSync(path.join(profileDir, 'desktop-plugins', 'dshbot')), false);
    assert.equal(fs.existsSync(path.join(profileDir, 'node_modules', 'dshbot')), false);
    assert.equal(fs.existsSync(presetDir), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('removeDshbotPreset keeps a user-installed dshbot and its preset', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    const installed = path.join(profileDir, 'node_modules', 'dshbot');
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(installed, 'package.json'), '{"name":"dshbot","version":"0.2.0"}\n', 'utf8');
    fs.writeFileSync(path.join(profileDir, 'package.json'), `${JSON.stringify({
      dependencies: { dshbot: '0.2.0' },
    }, null, 2)}\n`, 'utf8');
    const presetDir = path.join(home, '.agent-presets', 'dshbot-room');
    fs.mkdirSync(presetDir, { recursive: true });
    fs.writeFileSync(path.join(presetDir, 'agent.cordis.yml'), '- id: persona\n', 'utf8');
    const result = removeDshbotPreset({ profileDir });
    assert.equal(result.ok, true);
    assert.equal(result.removedLink, false);
    assert.equal(result.removedPreset, false);
    // User install and manifest dependency are untouched.
    assert.equal(fs.existsSync(path.join(installed, 'package.json')), true);
    const manifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
    assert.equal(manifest.dependencies.dshbot, '0.2.0');
    assert.equal(fs.existsSync(presetDir), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('removeDshbotPreset is a no-op on a clean profile', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    fs.mkdirSync(profileDir, { recursive: true });
    const result = removeDshbotPreset({ profileDir });
    assert.equal(result.ok, true);
    assert.equal(result.changed, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
