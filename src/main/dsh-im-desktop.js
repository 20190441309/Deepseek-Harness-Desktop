'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { missingRuntimeFiles } = require('./plugin-runtime-files');
const { webProfileDir, upsertManagedBlock, stripBlockFromFile } = require('./plugins');

/** npm package name (also used for market/forensics aliases). */
const DSH_IM_PACKAGE = '@xmanrui/dsh-im';
/** Scoped path under profile node_modules / legacy desktop-plugins. */
const DSH_IM_DIR = path.join('@xmanrui', 'dsh-im');
const DSH_IM_BEGIN = '# --- dshd-gui-dsh-im ---';
const DSH_IM_END = '# --- end dshd-gui-dsh-im ---';
/** Disable / forensics / market aliases. */
const DSH_IM_ALIASES = [DSH_IM_PACKAGE, 'dsh-im', 'xmanrui-dsh-im'];

function defaultSourceDir() {
  try {
    const { projectRoot } = require('./paths');
    return path.join(projectRoot(), 'vendor', 'dsh-im');
  } catch {
    return path.join(__dirname, '..', '..', 'vendor', 'dsh-im');
  }
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

/**
 * Remove a prior soft-preset copy under desktop-plugins so Loader cannot
 * prefer a stale incomplete tree over vendor/dsh-im.
 * @param {string} profileDir
 */
function removeLegacyDesktopCopy(profileDir) {
  removeLinkOrDir(path.join(profileDir, 'desktop-plugins', DSH_IM_DIR));
}

/**
 * Junction/symlink profile node_modules → vendor source so require() and
 * package-name resolution stay coherent with the file:// cordis insert.
 * @param {string} sourceDir
 * @param {string} profileDir
 */
function linkIntoProfileModules(sourceDir, profileDir) {
  const linked = path.join(profileDir, 'node_modules', DSH_IM_DIR);
  fs.mkdirSync(path.dirname(linked), { recursive: true });
  removeLinkOrDir(linked);
  fs.symlinkSync(sourceDir, linked, process.platform === 'win32' ? 'junction' : 'dir');
}

/**
 * Wire first-party `@xmanrui/dsh-im` from vendor (or packaged resources) via a
 * managed cordis package-name insert + profile node_modules junction to vendor.
 * Does not soft-copy into desktop-plugins.
 *
 * @param {{ sourceDir?: string, profileDir?: string, disabledPlugins?: string[] }} [options]
 * @returns {{
 *   ok: boolean,
 *   added?: boolean,
 *   disabled?: boolean,
 *   sourceDir?: string|null,
 *   href?: string,
 *   patchFile?: string,
 *   error?: string,
 * }}
 */
function ensureDesktopDshIm(options = {}) {
  const sourceDir = options.sourceDir || defaultSourceDir();
  if (!fs.existsSync(path.join(sourceDir, 'package.json'))) {
    return { ok: false, added: false, sourceDir: null, error: 'missing-source:package.json' };
  }
  const profileDir = options.profileDir || webProfileDir();
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  const disabled = require('./config').readDisabledPlugins(options);
  if (disabled.some((name) => DSH_IM_ALIASES.includes(name))) {
    stripBlockFromFile(patchFile, DSH_IM_BEGIN, DSH_IM_END);
    removeLegacyDesktopCopy(profileDir);
    return { ok: true, added: false, sourceDir: null, disabled: true };
  }

  const missing = missingRuntimeFiles(sourceDir);
  if (missing.length) {
    // Do NOT strip the insert and pretend success — caller must fail start.
    return {
      ok: false,
      added: false,
      sourceDir,
      error: `missing-source:node_modules:${missing.join(',')}`,
    };
  }

  removeLegacyDesktopCopy(profileDir);
  linkIntoProfileModules(sourceDir, profileDir);

  // Loader rejects directory file:// imports (ERR_UNSUPPORTED_DIR_IMPORT).
  // Resolve by package name via the junction into profile node_modules —
  // still first-party vendor, never a soft desktop-plugins copy.
  const body = [
    '- insert:',
    '    - id: xmanrui-dsh-im',
    `      name: ${JSON.stringify(DSH_IM_PACKAGE)}`,
  ].join('\n');
  const existed = fs.existsSync(patchFile)
    && fs.readFileSync(patchFile, 'utf8').includes(DSH_IM_BEGIN);
  upsertManagedBlock(patchFile, DSH_IM_BEGIN, DSH_IM_END, body);
  return {
    ok: true,
    added: !existed,
    sourceDir,
    href: pathToFileURL(sourceDir).href,
    patchFile,
  };
}

/** @deprecated Use ensureDesktopDshIm — kept as alias for harness wiring. */
function ensureDshImPlugin(options) {
  return ensureDesktopDshIm(options);
}

function withoutDshImAliases(list) {
  const blocked = new Set(DSH_IM_ALIASES);
  return (Array.isArray(list) ? list : []).filter((name) => !blocked.has(String(name || '').trim()));
}

module.exports = {
  DSH_IM_PACKAGE,
  DSH_IM_DIR,
  DSH_IM_BEGIN,
  DSH_IM_END,
  DSH_IM_ALIASES,
  withoutDshImAliases,
  ensureDesktopDshIm,
  ensureDshImPlugin,
};
