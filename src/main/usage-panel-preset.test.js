'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureUsagePanelPlugin } = require('./usage-panel-preset');
const { migrateLegacyDesktopBuiltins } = require('./desktop-builtin-migrate');

test('ensureUsagePanelPlugin is migration-only', (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-migrate-'));
  t.after(() => fs.rmSync(profileDir, { recursive: true, force: true }));
  const result = ensureUsagePanelPlugin({ profileDir });
  assert.equal(result.ok, true);
  assert.equal(result.overlayFile, null);
});

test('repo vendors the restyled dsh-usage-panel snapshot', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..', '..', 'vendor', 'dsh-usage-panel');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'dsh-usage-panel');
});

test('migrateLegacyDesktopBuiltins exports ok', () => {
  const result = migrateLegacyDesktopBuiltins({
    profileDir: require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'usage-')),
  });
  assert.equal(result.ok, true);
});
