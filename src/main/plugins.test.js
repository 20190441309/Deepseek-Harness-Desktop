'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ensureDesktopInstallPlugin } = require('./plugins');
const { migrateLegacyDesktopBuiltins } = require('./desktop-builtin-migrate');

function tempProfile(t) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dshd-plugins-'));
  t.after(() => fs.rmSync(profileDir, { recursive: true, force: true }));
  return profileDir;
}

test('ensureDesktopInstallPlugin strips legacy managed blocks only', (t) => {
  const profileDir = tempProfile(t);
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  fs.writeFileSync(patchFile, [
    '- insert:',
    '    - id: user-row',
    '      name: user-row',
    '# --- dshd-gui-desktop-install ---',
    '- insert:',
    '    - id: dshd-desktop-plugin-install',
    '      name: file:///old.mjs',
    '# --- end dshd-gui-desktop-install ---',
  ].join('\n'), 'utf8');
  const result = ensureDesktopInstallPlugin({ profileDir });
  assert.equal(result.ok, true);
  assert.equal(result.overlayFile, null);
  const patch = fs.readFileSync(patchFile, 'utf8');
  assert.match(patch, /user-row/);
  assert.doesNotMatch(patch, /dshd-desktop-plugin-install/);
});

test('migrateLegacyDesktopBuiltins removes stale overlay files', (t) => {
  const profileDir = tempProfile(t);
  const overlayDir = path.join(profileDir, 'desktop-plugins', 'install-dsh-plugin');
  fs.mkdirSync(overlayDir, { recursive: true });
  fs.writeFileSync(path.join(overlayDir, 'desktop-install.patch.yml'), '- insert:\n', 'utf8');
  const result = migrateLegacyDesktopBuiltins({ profileDir });
  assert.ok(result.removedOverlays.length > 0);
  assert.equal(fs.existsSync(path.join(overlayDir, 'desktop-install.patch.yml')), false);
});
