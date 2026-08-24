'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DSHBOT_BEGIN,
  DSHBOT_END,
  DSHBOT_FEATURE_ENABLED,
  ensureDshbotPlugin,
  hideDshbotPlugin,
} = require('./dshbot-preset');

test('dshbot feature is parked for 0.2.7', () => {
  assert.equal(DSHBOT_FEATURE_ENABLED, false);
});

function writeSource(dir) {
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'client'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'presets', 'dshbot-room'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({
    name: 'dshbot',
    version: '0.1.0',
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

test('ensureDshbotPlugin copies the bundled package, room preset, and inserts a managed patch', () => {
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
    const preset = path.join(home, '.agent-presets', 'dshbot-room', 'agent.cordis.yml');
    assert.equal(fs.existsSync(preset), true);
    const manifestFile = path.join(profileDir, 'package.json');
    assert.equal(fs.existsSync(manifestFile), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('ensureDshbotPlugin refreshes the bundled copy on later starts', () => {
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
      dependencies: { dshbot: '0.1.0' },
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

test('ensureDshbotPlugin fails closed when the bundled package is missing', () => {
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

test('ensureDshbotPlugin fails closed when the room preset is missing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = writeSource(fs.mkdtempSync(path.join(os.tmpdir(), 'dshbot-src-')));
  try {
    fs.rmSync(path.join(source, 'presets'), { recursive: true, force: true });
    const result = ensureDshbotPlugin({
      sourceDir: source,
      profileDir: path.join(home, 'profiles', 'web'),
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /missing-source:preset/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('repo vendors dshbot for offline profile copy', () => {
  const root = path.join(__dirname, '..', '..', 'vendor', 'dshbot');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'dshbot');
  assert.equal(fs.existsSync(path.join(root, 'client', 'client.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'lib', 'index.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'cordis.patch.yml')), true);
  assert.equal(fs.existsSync(path.join(root, 'presets', 'dshbot-room', 'agent.cordis.yml')), true);
});

test('hideDshbotPlugin strips the managed patch after ensure', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = writeSource(fs.mkdtempSync(path.join(os.tmpdir(), 'dshbot-src-')));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    ensureDshbotPlugin({ sourceDir: source, profileDir });
    const result = hideDshbotPlugin({ profileDir });
    assert.equal(result.ok, true);
    assert.equal(result.stripped, true);
    const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    assert.equal(patch.includes(DSHBOT_BEGIN), false);
    assert.equal(patch.includes('id: dsh-bot'), false);
    assert.equal(fs.existsSync(path.join(profileDir, 'desktop-plugins', 'dshbot', 'package.json')), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('hideDshbotPlugin drops dshbot from profile bundles and dependencies', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'package.json'), `${JSON.stringify({
      dependencies: { dshbot: '0.1.0', other: '1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-web-app', 'dshbot'] } },
    }, null, 2)}\n`, 'utf8');
    const result = hideDshbotPlugin({ profileDir });
    assert.equal(result.ok, true);
    assert.equal(result.manifestRemoved, true);
    const manifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
    assert.equal(Object.prototype.hasOwnProperty.call(manifest.dependencies, 'dshbot'), false);
    assert.equal(manifest.dependencies.other, '1.0.0');
    assert.deepEqual(manifest.dsh.profile.bundles, ['@deepseek-ai/dsh-web-app']);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('hideDshbotPlugin is a no-op when the profile has no dshbot insert', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    fs.mkdirSync(profileDir, { recursive: true });
    const result = hideDshbotPlugin({ profileDir });
    assert.equal(result.ok, true);
    assert.equal(result.stripped, false);
    assert.equal(result.manifestRemoved, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
