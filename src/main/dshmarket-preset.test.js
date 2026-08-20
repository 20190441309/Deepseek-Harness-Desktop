'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DSHMARKET_BEGIN,
  DSHMARKET_END,
  ensureDshMarketPlugin,
} = require('./dshmarket-preset');

function writeSource(dir) {
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'client'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({
    name: 'dshmarket',
    version: '1.14.0',
    type: 'module',
    main: 'lib/index.js',
    exports: { '.': './lib/index.js', './client': './client/client.js' },
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      client: { platform: 'web', inject: [] },
    },
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'lib', 'index.js'), 'export const name = "dsh-market"\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'client', 'client.js'), 'export function apply() {}\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: dsh-market',
    "      name: 'dshmarket'",
    '',
  ].join('\n'), 'utf8');
  return dir;
}

test('ensureDshMarketPlugin copies the bundled package and inserts a managed patch', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = writeSource(fs.mkdtempSync(path.join(os.tmpdir(), 'dshmarket-src-')));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    const result = ensureDshMarketPlugin({ sourceDir: source, profileDir });
    assert.equal(result.ok, true);
    assert.equal(result.added, true);
    const dest = path.join(profileDir, 'desktop-plugins', 'dshmarket');
    assert.equal(fs.readFileSync(path.join(dest, 'lib', 'index.js'), 'utf8'), 'export const name = "dsh-market"\n');
    assert.equal(fs.existsSync(path.join(dest, 'client', 'client.js')), true);
    const linked = path.join(profileDir, 'node_modules', 'dshmarket');
    assert.equal(fs.existsSync(path.join(linked, 'package.json')), true);
    const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    assert.ok(patch.includes(DSHMARKET_BEGIN));
    assert.ok(patch.includes(DSHMARKET_END));
    assert.ok(patch.includes('id: dsh-market'));
    assert.match(patch, /name: ['"]dshmarket['"]/);
    const manifestFile = path.join(profileDir, 'package.json');
    assert.equal(fs.existsSync(manifestFile), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('ensureDshMarketPlugin refreshes the bundled copy on later starts', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = writeSource(fs.mkdtempSync(path.join(os.tmpdir(), 'dshmarket-src-')));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    ensureDshMarketPlugin({ sourceDir: source, profileDir });
    fs.writeFileSync(path.join(source, 'lib', 'index.js'), 'export const name = "updated"\n', 'utf8');
    const again = ensureDshMarketPlugin({ sourceDir: source, profileDir });
    assert.equal(again.ok, true);
    assert.equal(again.added, false);
    const dest = path.join(profileDir, 'desktop-plugins', 'dshmarket', 'lib', 'index.js');
    assert.equal(fs.readFileSync(dest, 'utf8'), 'export const name = "updated"\n');
    const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    assert.equal(patch.split(DSHMARKET_BEGIN).length, 2);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('ensureDshMarketPlugin skips the patch insert when the profile already lists the bundle', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = writeSource(fs.mkdtempSync(path.join(os.tmpdir(), 'dshmarket-src-')));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'package.json'), `${JSON.stringify({
      dependencies: { dshmarket: '1.14.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-web-app', 'dshmarket'] } },
    }, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), [
      DSHMARKET_BEGIN,
      '- insert:',
      '    - id: dsh-market',
      '      name: "dshmarket"',
      DSHMARKET_END,
      '',
    ].join('\n'), 'utf8');
    const result = ensureDshMarketPlugin({ sourceDir: source, profileDir });
    assert.equal(result.ok, true);
    assert.equal(result.added, false);
    const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    assert.equal(patch.includes(DSHMARKET_BEGIN), false);
    assert.equal(patch.includes('id: dsh-market'), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('ensureDshMarketPlugin does not replace a pnpm-installed dshmarket directory', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = writeSource(fs.mkdtempSync(path.join(os.tmpdir(), 'dshmarket-src-')));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    const installed = path.join(profileDir, 'node_modules', 'dshmarket');
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(installed, 'package.json'), '{"name":"dshmarket","version":"9.9.9"}\n', 'utf8');
    ensureDshMarketPlugin({ sourceDir: source, profileDir });
    assert.equal(JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8')).version, '9.9.9');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('ensureDshMarketPlugin fails closed when the bundled package is missing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'dshmarket-missing-'));
  try {
    const result = ensureDshMarketPlugin({
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

test('ensureDshMarketPlugin copies bundled node_modules with the package', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = writeSource(fs.mkdtempSync(path.join(os.tmpdir(), 'dshmarket-src-')));
  try {
    const pkgFile = path.join(source, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    pkg.dependencies = { undici: '7.29.0' };
    fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    fs.mkdirSync(path.join(source, 'node_modules', 'undici'), { recursive: true });
    fs.writeFileSync(path.join(source, 'node_modules', 'undici', 'package.json'), '{"name":"undici"}\n', 'utf8');
    const profileDir = path.join(home, 'profiles', 'web');
    const result = ensureDshMarketPlugin({ sourceDir: source, profileDir });
    assert.equal(result.ok, true);
    const dest = path.join(profileDir, 'desktop-plugins', 'dshmarket', 'node_modules', 'undici', 'package.json');
    assert.equal(fs.existsSync(dest), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('ensureDshMarketPlugin fails closed and strips the insert when runtime deps are missing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const source = writeSource(fs.mkdtempSync(path.join(os.tmpdir(), 'dshmarket-src-')));
  try {
    const pkgFile = path.join(source, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    pkg.dependencies = { undici: '7.29.0' };
    fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    const profileDir = path.join(home, 'profiles', 'web');
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), [
      DSHMARKET_BEGIN,
      '- insert:',
      '    - id: dsh-market',
      '      name: "dshmarket"',
      DSHMARKET_END,
      '',
    ].join('\n'), 'utf8');
    const dest = path.join(profileDir, 'desktop-plugins', 'dshmarket', 'lib');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'index.js'), 'export const name = "kept"\n', 'utf8');
    const result = ensureDshMarketPlugin({ sourceDir: source, profileDir });
    assert.equal(result.ok, false);
    assert.match(result.error, /missing-source:node_modules:undici/);
    const patch = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    assert.equal(patch.includes(DSHMARKET_BEGIN), false);
    assert.equal(patch.includes('id: dsh-market'), false);
    assert.equal(fs.readFileSync(path.join(dest, 'index.js'), 'utf8'), 'export const name = "kept"\n');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('repo vendors published dshmarket for offline profile copy', () => {
  const root = path.join(__dirname, '..', '..', 'vendor', 'dshmarket');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'dshmarket');
  assert.equal(pkg.version, '1.14.0');
  assert.equal(fs.existsSync(path.join(root, 'client', 'client.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'lib', 'index.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'cordis.patch.yml')), true);
  for (const name of Object.keys(pkg.dependencies || {})) {
    assert.equal(
      fs.existsSync(path.join(root, 'node_modules', ...name.split('/'), 'package.json')),
      true,
      `vendored dshmarket is missing node_modules/${name}`,
    );
  }
});

test('dshmarket extraResources is nested under vendor so electron-builder keeps node_modules', () => {
  const extra = require('../../package.json').build.extraResources;
  const market = extra.find((entry) => (
    entry
    && entry.from === 'vendor'
    && entry.to === 'vendor'
    && Array.isArray(entry.filter)
    && entry.filter.includes('dshmarket/**')
  ));
  assert.ok(market, 'dshmarket extraResources must copy from vendor with filter dshmarket/**');
  assert.equal(extra.some((entry) => entry && entry.from === 'vendor/dshmarket'), false);
});
