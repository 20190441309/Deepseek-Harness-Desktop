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

function defaultPresetDir(profileDir) {
  return path.join(profileDir, '..', '..', '.agent-presets', ROOM_PRESET_ID);
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
  if (fs.existsSync(linked) && !fs.lstatSync(linked).isSymbolicLink()) {
    return;
  }
  fs.mkdirSync(path.dirname(linked), { recursive: true });
  if (fs.existsSync(linked)) {
    fs.unlinkSync(linked);
  }
  fs.symlinkSync(destDir, linked, process.platform === 'win32' ? 'junction' : 'dir');
}

function copyRoomPreset(sourceDir, presetDir) {
  const from = path.join(sourceDir, 'presets', ROOM_PRESET_ID);
  if (!fs.existsSync(path.join(from, 'agent.cordis.yml'))) {
    return { ok: false, error: 'missing-source:preset' };
  }
  fs.mkdirSync(presetDir, { recursive: true });
  fs.cpSync(from, presetDir, { recursive: true, force: true });
  return { ok: true, presetDir };
}

/**
 * Copy the bundled dshbot package into the web profile, register it through a
 * managed cordis.patch.yml insert, and install the room agent preset.
 * @param {{ sourceDir?: string, profileDir?: string, presetDir?: string }} [options]
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
  const preset = copyRoomPreset(sourceDir, options.presetDir || defaultPresetDir(profileDir));
  if (!preset.ok) {
    return { ok: false, added: false, error: preset.error, destDir };
  }
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  if (profileListsBundle(profileDir)) {
    stripBlockFromFile(patchFile, DSHBOT_BEGIN, DSHBOT_END);
    return { ok: true, added: false, destDir, presetDir: preset.presetDir };
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
    presetDir: preset.presetDir,
  };
}

function removeDshbotFromProfileManifest(profileDir) {
  const file = path.join(profileDir, 'package.json');
  if (!fs.existsSync(file)) {
    return { removed: false };
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { removed: false, error: 'invalid-profile' };
  }
  let changed = false;
  if (manifest.dependencies && Object.prototype.hasOwnProperty.call(manifest.dependencies, DSHBOT_PACKAGE)) {
    delete manifest.dependencies[DSHBOT_PACKAGE];
    changed = true;
  }
  const current = manifest.dsh?.profile?.bundles;
  if (Array.isArray(current) && current.includes(DSHBOT_PACKAGE)) {
    manifest.dsh = {
      ...manifest.dsh,
      profile: {
        ...manifest.dsh.profile,
        bundles: current.filter((name) => name !== DSHBOT_PACKAGE),
      },
    };
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  return { removed: changed };
}

/**
 * Stop loading the bundled dshbot plugin so the sidebar Bots tab stays absent.
 * Leaves `vendor/dshbot` and any already-copied profile files in place.
 * @param {{ profileDir?: string }} [options]
 */
function hideDshbotPlugin(options = {}) {
  const profileDir = options.profileDir || webProfileDir();
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  const stripped = stripBlockFromFile(patchFile, DSHBOT_BEGIN, DSHBOT_END);
  const manifest = removeDshbotFromProfileManifest(profileDir);
  if (manifest.error) {
    return { ok: false, stripped, manifestRemoved: false, error: manifest.error };
  }
  return { ok: true, stripped, manifestRemoved: Boolean(manifest.removed) };
}

module.exports = {
  DSHBOT_PACKAGE,
  DSHBOT_BEGIN,
  DSHBOT_END,
  ROOM_PRESET_ID,
  ensureDshbotPlugin,
  hideDshbotPlugin,
};
