'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migrateLegacyDesktopBuiltins } = require('./desktop-builtin-migrate');
const {
  DESKTOP_INSTALL_BEGIN,
  DESKTOP_INSTALL_END,
} = require('./plugins');
const { USAGE_PANEL_BEGIN, USAGE_PANEL_END } = require('./usage-panel-preset');
const { DSH_IM_BEGIN, DSH_IM_END } = require('./dsh-im-desktop');

function tempProfile(t) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshd-builtin-migrate-'));
  t.after(() => fs.rmSync(profileDir, { recursive: true, force: true }));
  return profileDir;
}

test('migrateLegacyDesktopBuiltins strips managed blocks and overlay files', (t) => {
  const profileDir = tempProfile(t);
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  fs.writeFileSync(patchFile, [
    '- insert:',
    '    - id: user-canary',
    '      name: user-canary',
    DESKTOP_INSTALL_BEGIN,
    '- insert:',
    '    - id: dshd-desktop-plugin-install',
    '      name: file:///stale.mjs',
    DESKTOP_INSTALL_END,
    USAGE_PANEL_BEGIN,
    '- insert:',
    '    - id: usage-stats',
    '      name: dsh-usage-panel',
    USAGE_PANEL_END,
    DSH_IM_BEGIN,
    '- insert:',
    '    - id: xmanrui-dsh-im',
    '      name: "@xmanrui/dsh-im"',
    DSH_IM_END,
  ].join('\n'), 'utf8');
  const overlayDir = path.join(profileDir, 'desktop-plugins', 'install-dsh-plugin');
  fs.mkdirSync(overlayDir, { recursive: true });
  fs.writeFileSync(path.join(overlayDir, 'desktop-install.patch.yml'), '- insert:\n', 'utf8');
  const result = migrateLegacyDesktopBuiltins({ profileDir });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  const patch = fs.readFileSync(patchFile, 'utf8');
  assert.match(patch, /user-canary/);
  assert.doesNotMatch(patch, /dshd-desktop-plugin-install/);
  assert.doesNotMatch(patch, /usage-stats/);
  assert.doesNotMatch(patch, /xmanrui-dsh-im/);
  assert.equal(fs.existsSync(path.join(overlayDir, 'desktop-install.patch.yml')), false);
});

test('ensureUsagePanelPlugin is migration-only', (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-migrate-'));
  t.after(() => fs.rmSync(profileDir, { recursive: true, force: true }));
  const { ensureUsagePanelPlugin } = require('./usage-panel-preset');
  const result = ensureUsagePanelPlugin({ profileDir });
  assert.equal(result.ok, true);
  assert.equal(result.overlayFile, null);
});

test('ensureDesktopDshIm delegates to migration', () => {
  const { ensureDesktopDshIm } = require('./dsh-im-desktop');
  const result = ensureDesktopDshIm({ profileDir: fs.mkdtempSync(path.join(os.tmpdir(), 'im-migrate-')) });
  assert.equal(result.ok, true);
  assert.equal(result.disabled, false);
});
