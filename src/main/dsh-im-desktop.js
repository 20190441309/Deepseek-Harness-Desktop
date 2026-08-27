'use strict';

const fs = require('fs');
const path = require('path');
const { webProfileDir, stripBlockFromFile } = require('./plugins');

/** npm package name (also used for market/forensics aliases). */
const DSH_IM_PACKAGE = '@xmanrui/dsh-im';
/** Scoped path under profile node_modules / legacy desktop-plugins. */
const DSH_IM_DIR = path.join('@xmanrui', 'dsh-im');
const DSH_IM_BEGIN = '# --- dshd-gui-dsh-im ---';
const DSH_IM_END = '# --- end dshd-gui-dsh-im ---';
/** Disable / forensics / market aliases. */
const DSH_IM_ALIASES = [DSH_IM_PACKAGE, 'dsh-im', 'xmanrui-dsh-im'];

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
 * @deprecated dsh-im composes through @deepseek-ai/dsh-web-app. Strips legacy
 * managed blocks and desktop-plugins copies only.
 */
function ensureDesktopDshIm(options = {}) {
  const { migrateLegacyDesktopBuiltins } = require('./desktop-builtin-migrate');
  const result = migrateLegacyDesktopBuiltins(options);
  return {
    ok: true,
    added: false,
    sourceDir: null,
    disabled: false,
    migrated: result,
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
  removeLegacyDesktopCopy,
  ensureDesktopDshIm,
  ensureDshImPlugin,
};
