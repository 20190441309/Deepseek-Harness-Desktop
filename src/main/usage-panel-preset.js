'use strict';

const fs = require('fs');
const path = require('path');
const { missingRuntimeFiles } = require('./plugin-runtime-files');
const { webProfileDir, upsertManagedBlock, stripBlockFromFile } = require('./plugins');

const USAGE_PANEL_PACKAGE = 'dsh-usage-panel';
const USAGE_PANEL_BEGIN = '# --- dshd-gui-usage-panel ---';
const USAGE_PANEL_END = '# --- end dshd-gui-usage-panel ---';

function defaultSourceDir() {
  try {
    const { projectRoot } = require('./paths');
    return path.join(projectRoot(), 'vendor', USAGE_PANEL_PACKAGE);
  } catch {
    return path.join(__dirname, '..', '..', 'vendor', USAGE_PANEL_PACKAGE);
  }
}

function profileListsBundle(profileDir) {
  const file = path.join(profileDir, 'package.json');
  if (!fs.existsSync(file)) {
    return false;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    const bundles = manifest.dsh?.profile?.bundles;
    return Array.isArray(bundles) && bundles.includes(USAGE_PANEL_PACKAGE);
  } catch {
    return false;
  }
}

function missingRuntimeDependencies(sourceDir) {
  return missingRuntimeFiles(sourceDir);
}

function pathExists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

function removeLinkOrDir(target) {
  if (!pathExists(target)) {
    return;
  }
  try {
    fs.readlinkSync(target);
    fs.unlinkSync(target);
    return;
  } catch {
    // Real directory or file, not a junction/symlink.
  }
  const st = fs.lstatSync(target);
  if (st.isSymbolicLink() || st.isFile()) {
    fs.unlinkSync(target);
    return;
  }
  fs.rmSync(target, { recursive: true, force: true });
}

function linkIntoProfileModules(destDir, profileDir) {
  const linked = path.join(profileDir, 'node_modules', USAGE_PANEL_PACKAGE);
  fs.mkdirSync(path.dirname(linked), { recursive: true });
  removeLinkOrDir(linked);
  fs.symlinkSync(destDir, linked, process.platform === 'win32' ? 'junction' : 'dir');
}

/**
 * Copy the bundled usage-panel package into the web profile and register it
 * through a managed cordis.patch.yml insert. Does not call `dsh plugin add`.
 * A non-junction marketplace install is replaced with a junction to the
 * desktop restyle so the projection key and settings section stay unique.
 * Missing `package.json` or zod returns `{ ok: false }` and strips the insert.
 * @param {{ sourceDir?: string, profileDir?: string, disabledPlugins?: string[] }} [options]
 */
function ensureUsagePanelPlugin(options = {}) {
  const sourceDir = options.sourceDir || defaultSourceDir();
  if (!fs.existsSync(path.join(sourceDir, 'package.json'))) {
    return { ok: false, added: false, error: 'missing-source:package.json' };
  }
  const profileDir = options.profileDir || webProfileDir();
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  const disabled = require('./config').readDisabledPlugins(options);
  if (disabled.includes(USAGE_PANEL_PACKAGE)) {
    stripBlockFromFile(patchFile, USAGE_PANEL_BEGIN, USAGE_PANEL_END);
    return { ok: true, added: false, destDir: null, disabled: true };
  }
  const destDir = path.join(profileDir, 'desktop-plugins', USAGE_PANEL_PACKAGE);
  const missing = missingRuntimeDependencies(sourceDir);
  if (missing.length) {
    stripBlockFromFile(patchFile, USAGE_PANEL_BEGIN, USAGE_PANEL_END);
    return {
      ok: false,
      added: false,
      error: `missing-source:node_modules:${missing.join(',')}`,
    };
  }
  const existed = fs.existsSync(path.join(destDir, 'package.json'));
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(sourceDir, destDir, { recursive: true, force: true });
  linkIntoProfileModules(destDir, profileDir);
  if (profileListsBundle(profileDir)) {
    stripBlockFromFile(patchFile, USAGE_PANEL_BEGIN, USAGE_PANEL_END);
    return { ok: true, added: false, destDir };
  }
  const body = [
    '- insert:',
    '    - id: usage-stats',
    `      name: ${JSON.stringify(USAGE_PANEL_PACKAGE)}`,
  ].join('\n');
  upsertManagedBlock(patchFile, USAGE_PANEL_BEGIN, USAGE_PANEL_END, body);
  return {
    ok: true,
    added: !existed,
    destDir,
    patchFile,
  };
}

module.exports = {
  USAGE_PANEL_PACKAGE,
  USAGE_PANEL_BEGIN,
  USAGE_PANEL_END,
  ensureUsagePanelPlugin,
};
