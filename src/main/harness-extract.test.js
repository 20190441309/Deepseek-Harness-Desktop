'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'electron') {
    return { app: {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const {
  tarCommand,
  hasBuiltHarness,
  canReuseExtractedHarness,
  packagedRuntimeIdentity,
  writeRuntimeStamp,
} = require('./harness-extract');
Module._load = originalLoad;

function seedBuiltHarness(root) {
  fs.mkdirSync(path.join(root, 'apps', 'cli', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps', 'web', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps', 'cli', 'lib', 'bin.js'), 'export {}\n');
  fs.writeFileSync(path.join(root, 'apps', 'web', 'dist', 'index.html'), '<html></html>\n');
  const pkg = path.join(root, 'packages', 'client', 'ui-user-terminal', 'lib');
  fs.mkdirSync(path.join(pkg, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'client.js'), 'export {}\n');
  for (const name of ['ghostty-vt.wasm', 'ghostty-write-pty.wasm', 'SymbolsNerdFontMono-Regular.woff2']) {
    fs.writeFileSync(path.join(pkg, 'assets', name), 'x');
  }
}

test('tarCommand uses PATH tar outside Windows', () => {
  assert.equal(tarCommand('linux'), 'tar');
  assert.equal(tarCommand('darwin'), 'tar');
});

test('tarCommand prefers the Windows system tar for local absolute paths', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'system-tar-test-'));
  const system32 = path.join(root, 'System32');
  const executable = path.join(system32, 'tar.exe');
  fs.mkdirSync(system32, { recursive: true });
  fs.writeFileSync(executable, '');
  const previousSystemRoot = process.env.SystemRoot;
  const previousWindir = process.env.WINDIR;
  process.env.SystemRoot = root;
  delete process.env.WINDIR;
  t.after(() => {
    if (previousSystemRoot === undefined) delete process.env.SystemRoot;
    else process.env.SystemRoot = previousSystemRoot;
    if (previousWindir === undefined) delete process.env.WINDIR;
    else process.env.WINDIR = previousWindir;
    fs.rmSync(root, { recursive: true, force: true });
  });

  assert.equal(tarCommand('win32'), executable);
});

test('tarCommand falls back to PATH when system tar is unavailable', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-system-tar-'));
  const previousSystemRoot = process.env.SystemRoot;
  const previousWindir = process.env.WINDIR;
  process.env.SystemRoot = root;
  delete process.env.WINDIR;
  t.after(() => {
    if (previousSystemRoot === undefined) delete process.env.SystemRoot;
    else process.env.SystemRoot = previousSystemRoot;
    if (previousWindir === undefined) delete process.env.WINDIR;
    else process.env.WINDIR = previousWindir;
    fs.rmSync(root, { recursive: true, force: true });
  });

  assert.equal(tarCommand('win32'), 'tar');
});

test('hasBuiltHarness requires Ghostty assets beside terminal client.js', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'built-harness-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'apps', 'cli', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps', 'web', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps', 'cli', 'lib', 'bin.js'), 'export {}\n');
  fs.writeFileSync(path.join(root, 'apps', 'web', 'dist', 'index.html'), '<html></html>\n');
  assert.equal(hasBuiltHarness(root), false);

  seedBuiltHarness(root);
  assert.equal(hasBuiltHarness(root), true);
});

test('a built extract without a stamp is not reused across same-version overlays', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  seedBuiltHarness(root);
  fs.writeFileSync(path.join(root, 'package.json'), '{"version":"0.1.0-rc.7"}\n');
  const identity = packagedRuntimeIdentity(
    { sha: '528c682e061696f5a160f363f236ecbf53cbd006', npm: '0.1.1-rc.1' },
    1509949440,
  );
  assert.equal(hasBuiltHarness(root), true);
  assert.equal(canReuseExtractedHarness(root, identity), false);
});

test('an extract matching the packaged pin and archive size is reused', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  seedBuiltHarness(root);
  const identity = packagedRuntimeIdentity(
    { sha: '528c682e061696f5a160f363f236ecbf53cbd006', npm: '0.1.1-rc.1' },
    1509949440,
  );
  writeRuntimeStamp(root, identity);
  assert.equal(canReuseExtractedHarness(root, identity), true);
});

test('an extract is refreshed when the packaged archive size changes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resized-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  seedBuiltHarness(root);
  writeRuntimeStamp(root, packagedRuntimeIdentity(
    { sha: '528c682e061696f5a160f363f236ecbf53cbd006', npm: '0.1.1-rc.1' },
    1509949440,
  ));
  const next = packagedRuntimeIdentity(
    { sha: '528c682e061696f5a160f363f236ecbf53cbd006', npm: '0.1.1-rc.1' },
    1509949441,
  );
  assert.equal(canReuseExtractedHarness(root, next), false);
});

test('ensurePackagedHarness reuses only a stamped matching extract', () => {
  const source = fs.readFileSync(path.join(__dirname, 'harness-extract.js'), 'utf8');
  assert.match(source, /canReuseExtractedHarness\(dest,/);
  assert.doesNotMatch(
    source,
    /if \(hasBuiltHarness\(dest\)\) \{\s*return dest;/,
  );
});
