const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAllowBuilds } = require('./marketplace-allowbuilds');

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
