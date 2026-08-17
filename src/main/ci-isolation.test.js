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

test('macOS release icon meets electron-builder minimum dimensions', () => {
  const png = fs.readFileSync(path.join(ROOT, 'assets', 'icon.png'));
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.ok(png.readUInt32BE(16) >= 512);
  assert.ok(png.readUInt32BE(20) >= 512);
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
  assert.match(yml, /macos-latest/);
  assert.match(yml, /\bnpm test\b/);
  assert.match(yml, /\bpnpm run test:gui\b/);
  assert.doesNotMatch(yml, /\bsmoke:source\b/);
  assert.doesNotMatch(yml, /\bsource-electron-smoke\b/);
});
