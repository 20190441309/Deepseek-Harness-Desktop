'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureDesktopDshIm } = require('./dsh-im-desktop');

test('ensureDesktopDshIm is migration-only', (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-migrate-'));
  t.after(() => fs.rmSync(profileDir, { recursive: true, force: true }));
  const result = ensureDesktopDshIm({ profileDir });
  assert.equal(result.ok, true);
  assert.equal(result.disabled, false);
  assert.equal(result.sourceDir, null);
});
