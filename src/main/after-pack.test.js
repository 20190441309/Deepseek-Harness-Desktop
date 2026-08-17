'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  assertHarnessRuntime,
  collectFiles,
  deployCliEntries,
  resolveDeployDir,
  resolveResourcesDir,
} = require('../../scripts/after-pack');

function makeFixture(t) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'after-pack-test-'));
  const source = path.join(workspace, 'source');
  const shared = path.join(workspace, 'shared');
  const destination = path.join(workspace, 'destination');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(shared, { recursive: true });
  fs.writeFileSync(path.join(shared, 'package.json'), '{"name":"shared"}\n');
  fs.writeFileSync(path.join(shared, 'index.js'), 'module.exports = true;\n');
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  return { source, shared, destination };
}

function linkPackage(source, shared, branch) {
  const nodeModules = path.join(source, branch, 'node_modules');
  fs.mkdirSync(nodeModules, { recursive: true });
  fs.symlinkSync(shared, path.join(nodeModules, 'shared'), 'junction');
}

test('deployCliEntries excludes runtime state and separately assembled directories', (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'after-pack-entries-'));
  for (const name of ['.dsh-home', '.cache', 'node_modules', 'vendor', 'config', 'lib']) {
    fs.mkdirSync(path.join(workspace, name), { recursive: true });
  }
  fs.writeFileSync(path.join(workspace, 'package.json'), '{}\n');
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));

  assert.deepEqual(
    deployCliEntries(workspace).map(({ name }) => name).sort(),
    ['config', 'lib', 'package.json'],
  );
});

test('collectFiles deduplicates a linked package flattened to the same destination', (t) => {
  const fixture = makeFixture(t);
  linkPackage(fixture.source, fixture.shared, 'a');
  linkPackage(fixture.source, fixture.shared, 'b');

  const files = collectFiles(fixture.source, fixture.destination, false, true);
  const destinations = files.map(({ dest }) => path.relative(fixture.destination, dest)).sort();

  assert.deepEqual(
    destinations,
    [path.join('node_modules', 'shared', 'index.js'), path.join('node_modules', 'shared', 'package.json')],
  );
});

test('collectFiles keeps shipped preset SKILL.md while stripping other markdown', (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'after-pack-skills-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const source = path.join(workspace, 'source');
  const destination = path.join(workspace, 'destination');
  const skill = path.join(
    source,
    'apps',
    'cli',
    'config',
    'agent-presets',
    'cordis',
    'skills',
    'editing-cordis-compositions',
    'SKILL.md',
  );
  const readme = path.join(source, 'apps', 'cli', 'README.md');
  const preset = path.join(source, 'apps', 'cli', 'config', 'agent-presets', 'cordis', 'preset.yml');
  fs.mkdirSync(path.dirname(skill), { recursive: true });
  fs.mkdirSync(path.dirname(readme), { recursive: true });
  fs.writeFileSync(skill, '# editing cordis compositions\n');
  fs.writeFileSync(readme, '# cli docs\n');
  fs.writeFileSync(preset, 'id: cordis\n');

  const files = collectFiles(source, destination, false, true);
  const destinations = files.map(({ dest }) => path.relative(destination, dest)).sort();

  assert.deepEqual(
    destinations,
    [
      path.join('apps', 'cli', 'config', 'agent-presets', 'cordis', 'preset.yml'),
      path.join(
        'apps',
        'cli',
        'config',
        'agent-presets',
        'cordis',
        'skills',
        'editing-cordis-compositions',
        'SKILL.md',
      ),
    ],
  );
});

test('collectFiles keeps preset SKILL.md when rooted at the deploy config directory', (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'after-pack-deploy-skills-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const source = path.join(workspace, 'config');
  const destination = path.join(workspace, 'destination');
  const skill = path.join(
    source,
    'agent-presets',
    'cordis',
    'skills',
    'cordis-plugin-development',
    'SKILL.md',
  );
  const readme = path.join(source, 'README.md');
  const preset = path.join(source, 'agent-presets', 'cordis', 'preset.yml');
  fs.mkdirSync(path.dirname(skill), { recursive: true });
  fs.writeFileSync(skill, '# cordis plugin development\n');
  fs.writeFileSync(readme, '# config docs\n');
  fs.writeFileSync(preset, 'id: cordis\n');

  const files = collectFiles(source, destination, true, false);
  const destinations = files.map(({ dest }) => path.relative(destination, dest)).sort();

  assert.deepEqual(
    destinations,
    [
      path.join('agent-presets', 'cordis', 'preset.yml'),
      path.join('agent-presets', 'cordis', 'skills', 'cordis-plugin-development', 'SKILL.md'),
    ],
  );
});

test('collectFiles preserves a linked package copied to distinct destinations', (t) => {
  const fixture = makeFixture(t);
  linkPackage(fixture.source, fixture.shared, 'a');
  linkPackage(fixture.source, fixture.shared, 'b');

  const files = collectFiles(fixture.source, fixture.destination, false, false);
  const destinations = files.map(({ dest }) => path.relative(fixture.destination, dest)).sort();

  assert.deepEqual(
    destinations,
    [
      path.join('a', 'node_modules', 'shared', 'index.js'),
      path.join('a', 'node_modules', 'shared', 'package.json'),
      path.join('b', 'node_modules', 'shared', 'index.js'),
      path.join('b', 'node_modules', 'shared', 'package.json'),
    ],
  );
});

test('resolveDeployDir ignores local caches unless a deploy directory is explicit', () => {
  assert.equal(resolveDeployDir(undefined), null);
  assert.equal(resolveDeployDir(''), null);
  assert.equal(resolveDeployDir('off'), null);
  assert.equal(resolveDeployDir('.pack-release'), path.resolve('.pack-release'));
});

test('assertHarnessRuntime accepts a complete compatible host', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'after-pack-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = new Map([
    [path.join('apps', 'cli', 'lib', 'bin.js'), 'export {}\n'],
    [path.join('apps', 'cli', 'lib', 'plugin.js'), 'missingHostFeatures parseCompatibilityFeatures\n'],
    [path.join('apps', 'web', 'dist', 'index.html'), '<!doctype html>\n'],
    [
      path.join('node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'features.js'),
      'conversation.chat.user-actions session.fork.beforeSeq session.fork.blank\n',
    ],
    [
      path.join('node_modules', '@deepseek-ai', 'dsh-client-modules', 'lib', 'index.js'),
      'missingHostFeatures parseCompatibilityFeatures\n',
    ],
    [
      path.join('node_modules', '@deepseek-ai', 'dsh-client-ui-conversation', 'lib', 'client.js'),
      'conversation.chat.user-actions\n',
    ],
    [path.join('node_modules', '@deepseek-ai', 'dsh-mcp-servers-file', 'lib', 'index.js'), 'export {}\n'],
    [path.join('node_modules', '@deepseek-ai', 'dsh-host-mcp-servers', 'lib', 'index.js'), 'export {}\n'],
    [path.join('node_modules', '@deepseek-ai', 'dsh-host-skill-inventory', 'lib', 'index.js'), 'export {}\n'],
    [path.join('node_modules', '@deepseek-ai', 'dsh-client-ui-settings-mcp', 'lib', 'index.js'), 'export {}\n'],
    [path.join('node_modules', '@deepseek-ai', 'dsh-client-ui-settings-mcp', 'lib', 'client.js'), 'export {}\n'],
    [path.join('node_modules', '@deepseek-ai', 'dsh-client-ui-settings-skills', 'lib', 'index.js'), 'export {}\n'],
    [path.join('node_modules', '@deepseek-ai', 'dsh-client-ui-settings-skills', 'lib', 'client.js'), 'export {}\n'],
  ]);
  for (const [relative, content] of files) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }

  assert.doesNotThrow(() => assertHarnessRuntime(root));
});

test('assertHarnessRuntime rejects a host missing MCP settings runtime', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'after-pack-mcp-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = new Map([
    [path.join('apps', 'cli', 'lib', 'bin.js'), 'export {}\n'],
    [path.join('apps', 'cli', 'lib', 'plugin.js'), 'missingHostFeatures parseCompatibilityFeatures\n'],
    [path.join('apps', 'web', 'dist', 'index.html'), '<!doctype html>\n'],
    [
      path.join('node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'features.js'),
      'conversation.chat.user-actions session.fork.beforeSeq session.fork.blank\n',
    ],
    [
      path.join('node_modules', '@deepseek-ai', 'dsh-client-modules', 'lib', 'index.js'),
      'missingHostFeatures parseCompatibilityFeatures\n',
    ],
    [
      path.join('node_modules', '@deepseek-ai', 'dsh-client-ui-conversation', 'lib', 'client.js'),
      'conversation.chat.user-actions\n',
    ],
  ]);
  for (const [relative, content] of files) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }

  assert.throws(
    () => assertHarnessRuntime(root),
    /dsh-mcp-servers-file/,
  );
});

test('assertHarnessRuntime rejects stale deploy output before archiving', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'after-pack-stale-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'apps', 'cli', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps', 'web', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps', 'cli', 'lib', 'bin.js'), 'export {}\n');
  fs.writeFileSync(path.join(root, 'apps', 'web', 'dist', 'index.html'), '<!doctype html>\n');

  assert.throws(
    () => assertHarnessRuntime(root),
    /dsh-app-boot.*features\.js/,
  );
});

test('resolveResourcesDir uses Contents/Resources inside the macOS .app', () => {
  const darwin = resolveResourcesDir({
    electronPlatformName: 'darwin',
    appOutDir: path.join('dist', 'mac-arm64'),
    packager: { appInfo: { productFilename: 'Deepseek-Harness-Desktop' } },
  });
  assert.equal(
    darwin,
    path.join('dist', 'mac-arm64', 'Deepseek-Harness-Desktop.app', 'Contents', 'Resources'),
  );
});

test('resolveResourcesDir prefers electron-builder getResourcesDir', () => {
  const expected = path.join('out', 'Resources');
  assert.equal(
    resolveResourcesDir({
      electronPlatformName: 'darwin',
      appOutDir: path.join('dist', 'mac'),
      packager: {
        getResourcesDir: (appOutDir) => {
          assert.equal(appOutDir, path.join('dist', 'mac'));
          return expected;
        },
      },
    }),
    expected,
  );
});

test('resolveResourcesDir uses the unpacked resources folder on Windows', () => {
  assert.equal(
    resolveResourcesDir({
      electronPlatformName: 'win32',
      appOutDir: path.join('dist', 'win-unpacked'),
    }),
    path.join('dist', 'win-unpacked', 'resources'),
  );
});
