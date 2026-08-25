'use strict';

// Locks the publishable manifest of the standalone dshbot plugin
// (vendor/dshbot). The publish workflow (.github/workflows/publish-dshbot.yml)
// runs scripts/check-dshbot-publish.mjs with the same rules right before
// `npm publish`; this suite keeps a broken manifest from reaching the tag.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');
const pkgDir = path.join(repoRoot, 'vendor', 'dshbot');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));

test('dshbot is publishable: public, MIT, semver, no private flag', () => {
  assert.equal(Boolean(pkg.private), false);
  assert.equal(pkg.publishConfig && pkg.publishConfig.access, 'public');
  assert.equal(pkg.license, 'MIT');
  assert.match(String(pkg.version), /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  assert.equal(fs.existsSync(path.join(pkgDir, 'LICENSE')), true);
  assert.equal(fs.existsSync(path.join(pkgDir, 'README.md')), true);
});

test('every dshbot export target exists and is covered by the files manifest', () => {
  const filesList = pkg.files;
  assert.ok(Array.isArray(filesList) && filesList.length > 0);
  const alwaysPacked = new Set(['package.json', 'README.md', 'LICENSE']);
  const covered = (relPath) =>
    alwaysPacked.has(relPath)
    || filesList.some((entry) => relPath === entry || relPath.startsWith(`${entry}/`));

  for (const [key, target] of Object.entries(pkg.exports)) {
    assert.equal(typeof target, 'string', `exports[${key}] must be a path string`);
    const relPath = target.replace(/^\.\//, '');
    assert.equal(
      fs.existsSync(path.join(pkgDir, relPath)),
      true,
      `exports[${key}] -> ${target} must exist`,
    );
    assert.equal(covered(relPath), true, `exports[${key}] -> ${target} must be packed`);
  }

  const mainPath = pkg.main.replace(/^\.\//, '');
  assert.equal(fs.existsSync(path.join(pkgDir, mainPath)), true);
  assert.equal(fs.existsSync(path.join(pkgDir, 'presets', 'dshbot-room')), true);
});

test('the publish preflight script passes and enforces the dshbot-v tag shape', () => {
  const script = path.join(repoRoot, 'scripts', 'check-dshbot-publish.mjs');

  const ok = spawnSync(process.execPath, [script, `dshbot-v${pkg.version}`], {
    encoding: 'utf8',
  });
  assert.equal(ok.status, 0, ok.stderr || ok.stdout);

  const badTag = spawnSync(process.execPath, [script, 'v0.0.0'], { encoding: 'utf8' });
  assert.equal(badTag.status, 1);
  assert.match(badTag.stderr, /does not match vendor\/dshbot version/);
});
