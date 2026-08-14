const fs = require('fs');
const os = require('os');
const path = require('path');

const PROFILE = 'web';
const DROPPED = [
  '@dsh-external/dsh-genui',
  '@huanlin/dsh-plugin-yet-another-subagent',
];
const PATCH_BEGIN = '# --- dsh-gui-plugin-toggles ---';
const PATCH_END = '# --- end dsh-gui-plugin-toggles ---';

function dshHome() {
  const fromEnv = process.env.DSH_HOME;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }
  return path.join(os.homedir(), '.dsh');
}

function webProfileDir() {
  return path.join(dshHome(), 'profiles', PROFILE);
}

function manifestPath() {
  return path.join(webProfileDir(), 'package.json');
}

function patchPath() {
  return path.join(webProfileDir(), 'cordis.patch.yml');
}

function writeAtomic(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf8');
  fs.renameSync(tmp, file);
}

function stripManagedPatch() {
  const file = patchPath();
  if (!fs.existsSync(file)) {
    return false;
  }
  const text = fs.readFileSync(file, 'utf8');
  const begin = text.indexOf(PATCH_BEGIN);
  const end = text.indexOf(PATCH_END);
  if (begin === -1 || end === -1 || end < begin) {
    return false;
  }
  const next = `${text.slice(0, begin)}${text.slice(end + PATCH_END.length)}`.replace(/\n{3,}/g, '\n\n');
  if (next === text) {
    return false;
  }
  writeAtomic(file, next);
  return true;
}

/** Drop retired community plugins from the live web profile so they cannot boot. */
function stripDroppedPlugins() {
  const file = manifestPath();
  if (!fs.existsSync(file)) {
    return { ok: false, reason: 'missing-profile' };
  }
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = false;
  if (manifest.dependencies) {
    for (const name of DROPPED) {
      if (Object.prototype.hasOwnProperty.call(manifest.dependencies, name)) {
        delete manifest.dependencies[name];
        changed = true;
      }
    }
  }
  const current = manifest.dsh?.profile?.bundles;
  if (Array.isArray(current)) {
    const bundles = current.filter((name) => !DROPPED.includes(name));
    if (bundles.length !== current.length) {
      manifest.dsh = {
        ...manifest.dsh,
        profile: {
          ...manifest.dsh.profile,
          bundles,
        },
      };
      changed = true;
    }
  }
  if (changed) {
    writeAtomic(file, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const patchChanged = stripManagedPatch();
  return { ok: true, changed, patchChanged };
}

function listInstalledPlugins() {
  const file = manifestPath();
  if (!fs.existsSync(file)) {
    return { ok: true, profile: PROFILE, profileDir: webProfileDir(), plugins: [], bundles: [] };
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    const dependencies = manifest.dependencies && typeof manifest.dependencies === 'object'
      ? manifest.dependencies
      : {};
    const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : [];
    return {
      ok: true,
      profile: PROFILE,
      profileDir: webProfileDir(),
      plugins: Object.entries(dependencies).map(([name, spec]) => ({
        name,
        spec: String(spec || ''),
        bundle: bundles.includes(name),
        dropped: DROPPED.includes(name),
      })),
      bundles,
    };
  } catch {
    return { ok: false, profile: PROFILE, profileDir: webProfileDir(), plugins: [], bundles: [] };
  }
}

module.exports = {
  PROFILE,
  DROPPED,
  webProfileDir,
  stripDroppedPlugins,
  listInstalledPlugins,
};
