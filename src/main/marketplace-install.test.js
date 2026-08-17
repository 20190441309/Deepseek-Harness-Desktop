const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAllowBuilds } = require('./marketplace-allowbuilds');
const { installPlugin, uninstallPlugin } = require('./marketplace-install');

test('parseAllowBuilds reads ignored build script names', () => {
  const keys = parseAllowBuilds(`
pnpm: git-hosted plugins build on install
Ignored build scripts: @dsh-external/dsh-loop@0.1.0 foo-bar@2.0.0
Run "pnpm approve-builds" to pick which dependencies should be allowed
`);
  assert.ok(keys.includes('@dsh-external/dsh-loop'));
  assert.ok(keys.includes('foo-bar'));
});

test('parseAllowBuilds reads yaml-style allowBuilds keys', () => {
  const keys = parseAllowBuilds(`
add the exact key under allowBuilds:
  "github.com/owner/repo": false
`);
  assert.ok(keys.includes('github.com/owner/repo'));
});

test('parseAllowBuilds drops path and yaml-like keys', () => {
  const keys = parseAllowBuilds(`
  "../prepare": false
  "good-package": false
  "bad:key": false
`);
  assert.deepEqual(keys, ['good-package']);
});

test('installPlugin rejects non-github specs before invoking the CLI', async () => {
  const result = await installPlugin('file:../local-plugin', { allowBuilds: [] });
  assert.equal(result.ok, false);
  assert.match(result.error, /github:owner\/repo/);
});

test('installPlugin rejects invalid allowBuilds before invoking the CLI', async () => {
  const result = await installPlugin('github:owner/repo', { allowBuilds: ['../prepare'] });
  assert.equal(result.ok, false);
  assert.match(result.error, /allowBuilds/);
});

test('uninstallPlugin rejects shell syntax before invoking the CLI', async () => {
  const result = await uninstallPlugin('safe-package & calc.exe');
  assert.equal(result.ok, false);
  assert.match(result.error, /包名/);
});
