'use strict';

const fs = require('fs');
const path = require('path');
const { webProfileDir, upsertManagedBlock, stripBlockFromFile } = require('./plugins');

const DSHBOT_PACKAGE = 'dshbot';
const DSHBOT_BEGIN = '# --- dshd-gui-dshbot ---';
const DSHBOT_END = '# --- end dshd-gui-dshbot ---';
const ROOM_PRESET_ID = 'dshbot-room';

function defaultSourceDir() {
  try {
    const { projectRoot } = require('./paths');
    return path.join(projectRoot(), 'vendor', 'dshbot');
  } catch {
    return path.join(__dirname, '..', '..', 'vendor', 'dshbot');
  }
}

function dshHomeFromProfile(profileDir) {
  return path.join(profileDir, '..', '..');
}

function defaultPresetDir(profileDir) {
  return path.join(dshHomeFromProfile(profileDir), '.agent-presets', ROOM_PRESET_ID);
}

function profileListsBundle(profileDir) {
  const file = path.join(profileDir, 'package.json');
  if (!fs.existsSync(file)) {
    return false;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    const bundles = manifest.dsh?.profile?.bundles;
    return Array.isArray(bundles) && bundles.includes(DSHBOT_PACKAGE);
  } catch {
    return false;
  }
}

function linkIntoProfileModules(destDir, profileDir) {
  const linked = path.join(profileDir, 'node_modules', DSHBOT_PACKAGE);
  if (fs.existsSync(linked)) {
    if (!fs.lstatSync(linked).isSymbolicLink()) {
      // Real directory install (e.g. marketplace copy) — never replace.
      return;
    }
    if (!isDesktopPresetLink(linked, destDir)) {
      // External symlink (pnpm / dsh plugin add) — never replace.
      return;
    }
  }
  fs.mkdirSync(path.dirname(linked), { recursive: true });
  if (fs.existsSync(linked)) {
    fs.unlinkSync(linked);
  }
  fs.symlinkSync(destDir, linked, process.platform === 'win32' ? 'junction' : 'dir');
}

/**
 * Whether the desktop config opts into the local dev preset copy.
 * dshbot is a standalone plugin; the desktop never force-loads it.
 * @param {{ dshbotPreset?: boolean } | undefined} config
 * @returns {boolean}
 */
function isDshbotPresetEnabled(config) {
  return config?.dshbotPreset === true;
}

/**
 * Dev opt-in (config `dshbotPreset: true`): copy the workspace dshbot package
 * into the web profile and register it through a managed cordis.patch.yml
 * insert (the same BEGIN/END managed-block mechanism the removed dshmarket
 * preset used). The room preset is NOT copied here — the plugin
 * provisions `$DSH_HOME/.agent-presets/dshbot-room` itself at apply time.
 * Callers log failures and continue; ensure never blocks start.
 * @param {{ sourceDir?: string, profileDir?: string }} [options]
 */
function ensureDshbotPlugin(options = {}) {
  const sourceDir = options.sourceDir || defaultSourceDir();
  if (!fs.existsSync(path.join(sourceDir, 'package.json'))) {
    return { ok: false, added: false, error: 'missing-source:package.json' };
  }
  const profileDir = options.profileDir || webProfileDir();
  const destDir = path.join(profileDir, 'desktop-plugins', DSHBOT_PACKAGE);
  const existed = fs.existsSync(path.join(destDir, 'package.json'));
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(sourceDir, destDir, { recursive: true, force: true });
  linkIntoProfileModules(destDir, profileDir);
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  if (profileListsBundle(profileDir)) {
    stripBlockFromFile(patchFile, DSHBOT_BEGIN, DSHBOT_END);
    return { ok: true, added: false, destDir };
  }
  const body = [
    '- insert:',
    '    - id: dsh-bot',
    `      name: ${JSON.stringify(DSHBOT_PACKAGE)}`,
  ].join('\n');
  upsertManagedBlock(patchFile, DSHBOT_BEGIN, DSHBOT_END, body);
  return {
    ok: true,
    added: !existed,
    destDir,
    patchFile,
  };
}

/**
 * Whether `node_modules/dshbot` is the desktop preset symlink (ours) rather
 * than a real install. pnpm installs also use symlinks, so only a link that
 * resolves to the desktop-plugins copy counts.
 * @param {string} linked
 * @param {string} destDir
 * @returns {boolean}
 */
function isDesktopPresetLink(linked, destDir) {
  try {
    if (!fs.lstatSync(linked).isSymbolicLink()) {
      return false;
    }
    const target = path.resolve(path.dirname(linked), fs.readlinkSync(linked));
    return target === path.resolve(destDir);
  } catch {
    return false;
  }
}

/**
 * Whether a non-desktop dshbot install remains in the profile: a real
 * `node_modules/dshbot` (dsh plugin add / pnpm), a manifest dependency, or a
 * profile bundle entry. Those are user data and must never be removed here.
 * @param {string} profileDir
 * @returns {boolean}
 */
function dshbotUserInstallPresent(profileDir) {
  if (fs.existsSync(path.join(profileDir, 'node_modules', DSHBOT_PACKAGE, 'package.json'))) {
    return true;
  }
  const file = path.join(profileDir, 'package.json');
  if (!fs.existsSync(file)) {
    return false;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (manifest.dependencies && Object.prototype.hasOwnProperty.call(manifest.dependencies, DSHBOT_PACKAGE)) {
      return true;
    }
    const bundles = manifest.dsh?.profile?.bundles;
    return Array.isArray(bundles) && bundles.includes(DSHBOT_PACKAGE);
  } catch {
    return false;
  }
}

/**
 * Remove desktop-preset residue so a detached dshbot leaves nothing behind:
 * the managed patch block, the desktop-plugins copy, the preset symlink, and
 * — only when no user install of dshbot remains — the self-provisioned
 * `.agent-presets/dshbot-room` directory. Profile dependencies and bundles
 * written by `dsh plugin add` are user data and stay untouched.
 * @param {{ profileDir?: string, presetDir?: string }} [options]
 */
function removeDshbotPreset(options = {}) {
  const profileDir = options.profileDir || webProfileDir();
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  const stripped = stripBlockFromFile(patchFile, DSHBOT_BEGIN, DSHBOT_END);
  const destDir = path.join(profileDir, 'desktop-plugins', DSHBOT_PACKAGE);
  const linked = path.join(profileDir, 'node_modules', DSHBOT_PACKAGE);
  let removedLink = false;
  if (isDesktopPresetLink(linked, destDir)) {
    try {
      fs.unlinkSync(linked);
      removedLink = true;
    } catch {
      // A stuck link is reported through `changed: false`; start continues.
    }
  }
  let removedCopy = false;
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
    removedCopy = true;
  }
  let removedPreset = false;
  if (!dshbotUserInstallPresent(profileDir)) {
    const presetDir = options.presetDir || defaultPresetDir(profileDir);
    if (fs.existsSync(presetDir)) {
      fs.rmSync(presetDir, { recursive: true, force: true });
      removedPreset = true;
    }
  }
  return {
    ok: true,
    stripped,
    removedCopy,
    removedLink,
    removedPreset,
    changed: stripped || removedCopy || removedLink || removedPreset,
  };
}

module.exports = {
  DSHBOT_PACKAGE,
  DSHBOT_BEGIN,
  DSHBOT_END,
  ROOM_PRESET_ID,
  isDshbotPresetEnabled,
  ensureDshbotPlugin,
  removeDshbotPreset,
};
