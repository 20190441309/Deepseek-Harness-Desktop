'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

/**
 * Pins that make `npm test` require `vendor/deepseek-harness/node_modules`.
 * These pass on a prepared developer machine and fail on a clean CI checkout.
 */
function listVendorHarnessRootPins(source) {
  const pins = [];
  const joined = /DSH_HARNESS_ROOT\s*=\s*path\.join\([^;]*['"]vendor['"]\s*,\s*['"]deepseek-harness['"]/g;
  const literal = /DSH_HARNESS_ROOT\s*=\s*[^;\n]*vendor[/\\]deepseek-harness/g;
  for (const re of [joined, literal]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source))) pins.push(match[0]);
  }
  return pins;
}

function walkTestFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTestFiles(full, out);
    else if (entry.name.endsWith('.test.js')) out.push(full);
  }
  return out;
}

function fakePng(width, height) {
  const buf = Buffer.alloc(24);
  buf[0] = 0x89;
  buf.write('PNG', 1, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

test('macOS icon check rejects the 386px capture that failed v0.2.3 packing', () => {
  const { assertMacReleaseIcon } = require('../../scripts/check-mac-icon');
  assert.throws(
    () => assertMacReleaseIcon(fakePng(386, 386), 'assets/icon.png'),
    /386x386/,
  );
});

test('macOS release icon meets electron-builder minimum dimensions', () => {
  const { assertMacReleaseIcon, MIN_MAC_ICON_PX } = require('../../scripts/check-mac-icon');
  const png = fs.readFileSync(path.join(ROOT, 'assets', 'icon.png'));
  const size = assertMacReleaseIcon(png, 'assets/icon.png');
  assert.ok(size.width >= MIN_MAC_ICON_PX);
  assert.ok(size.height >= MIN_MAC_ICON_PX);
});

test('icon renderer writes a display-independent PNG size', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'render-icon.js'), 'utf8');
  assert.match(source, /PNG_SIZE = 1024/);
  assert.match(source, /resize\(\{[\s\S]*width:\s*PNG_SIZE[\s\S]*height:\s*PNG_SIZE/);
  assert.match(source, /assertMacReleaseIcon/);
});

test('macOS pack job rejects a too-small icon before electron-builder', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
  const checkAt = yml.indexOf('node scripts/check-mac-icon.js');
  const distAt = yml.indexOf('npm run dist:mac');
  assert.ok(checkAt >= 0);
  assert.ok(distAt > checkAt);
});

test('a vendor DSH_HARNESS_ROOT pin is visible to the isolation scan', () => {
  const tagged = `process.env.${'DSH_HARNESS' + '_ROOT'} = path.join(__dirname, '..', '..', 'vendor', 'deepseek-harness');\n`;
  assert.equal(listVendorHarnessRootPins(tagged).length, 1);
});

test('desktop unit tests do not pin DSH_HARNESS_ROOT to vendor/deepseek-harness', () => {
  const hits = [];
  for (const file of walkTestFiles(path.join(ROOT, 'src'))) {
    const pins = listVendorHarnessRootPins(fs.readFileSync(file, 'utf8'));
    for (const pin of pins) hits.push(`${path.relative(ROOT, file).replaceAll('\\', '/')}: ${pin}`);
  }
  assert.deepEqual(hits, []);
});

test('release workflow builds artifacts without repeating quality or viewport-dependent gates', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.doesNotMatch(yml, /\bnpm test\b/);
  assert.doesNotMatch(yml, /\bpnpm run test:gui\b/);
  assert.doesNotMatch(yml, /\bsmoke:packaged\b/);
  assert.doesNotMatch(yml, /pnpm\/action-setup/);
  assert.match(yml, /node scripts\/setup-harness\.js/);
  assert.match(yml, /npm run dist\b/);
  assert.match(yml, /npm run dist:mac\b/);
});

test('release.yml still publishes when Windows succeeds and macOS fails', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(yml, /always\(\)/);
  assert.match(yml, /needs\.windows\.result == 'success'/);
});

test('test workflow keeps portable quality gates without the viewport-dependent smoke', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'test.yml'), 'utf8');
  const desktop = yml.slice(0, yml.indexOf('\n  vendor-gui:'));
  const electronAt = desktop.indexOf('node node_modules/electron/install.js');
  const testAt = desktop.indexOf('npm test');
  assert.match(yml, /macos-latest/);
  assert.match(yml, /\bnpm test\b/);
  assert.match(yml, /node node_modules\/pnpm\/bin\/pnpm\.cjs --dir vendor\/deepseek-harness run test:gui/);
  assert.doesNotMatch(yml, /pnpm\/action-setup/);
  assert.ok(electronAt >= 0);
  assert.ok(testAt > electronAt);
  assert.doesNotMatch(yml, /\bsmoke:source\b/);
  assert.doesNotMatch(yml, /\bsource-electron-smoke\b/);
});

test('setup-harness uses the lockfile-installed pnpm executable', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'setup-harness.js'), 'utf8');
  assert.match(source, /node_modules['"], ['"]pnpm['"], ['"]bin['"], ['"]pnpm\.cjs/);
});
