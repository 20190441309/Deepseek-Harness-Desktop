const fs = require('fs');
const os = require('os');
const path = require('path');

const PROFILE = 'web';
const CORE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'];

const GENUI = {
  name: '@dsh-external/dsh-genui',
  url: 'https://github.com/omdsh-dev/dsh-genui',
  entryId: 'genui',
};

const SUBAGENT = {
  name: '@huanlin/dsh-plugin-yet-another-subagent',
  url: 'https://github.com/HuanLinOTO/dsh-plugin-yet-another-subagent',
  entryId: 'yet-another-subagent',
  restoreId: 'tool-subagent',
};

const PATCH_BEGIN = '# --- dsh-gui-plugin-toggles ---';
const PATCH_END = '# --- end dsh-gui-plugin-toggles ---';

const DEFAULT_PATCH_HEADER = [
  '# Your patch layer for this dsh profile, applied after every bundle layer:',
  '# a top-level YAML array of loader patch entries (id-targeted config',
  '# overrides, disables, and insert lists; `!!js` expressions allowed).',
].join('\n');

function flagOn(value) {
  return value !== false;
}

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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeAtomic(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf8');
  fs.renameSync(tmp, file);
}

function pluginAbout() {
  return {
    genui: { name: GENUI.name, url: GENUI.url },
    subagent: { name: SUBAGENT.name, url: SUBAGENT.url },
  };
}

function unique(list) {
  const out = [];
  for (const item of list) {
    if (item && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

/**
 * Keep installed community plugins on the profile layer stack when enabled;
 * drop them from `dsh.profile.bundles` when disabled. Dependencies stay so
 * this is not an uninstall — `dsh plugin` can still see the packages.
 */
function syncBundles(manifest, genUiOn, subagentOn) {
  const current = Array.isArray(manifest.dsh?.profile?.bundles)
    ? [...manifest.dsh.profile.bundles]
    : [...CORE_BUNDLES];
  const deps = manifest.dependencies || {};
  const extras = current.filter(
    (name) =>
      !CORE_BUNDLES.includes(name) && name !== GENUI.name && name !== SUBAGENT.name,
  );
  const bundles = unique([
    ...CORE_BUNDLES,
    ...extras,
    ...(deps[GENUI.name] && genUiOn ? [GENUI.name] : []),
    ...(deps[SUBAGENT.name] && subagentOn ? [SUBAGENT.name] : []),
  ]);
  const same =
    bundles.length === current.length && bundles.every((name, i) => name === current[i]);
  if (same) {
    return false;
  }
  manifest.dsh = {
    ...manifest.dsh,
    profile: {
      ...manifest.dsh?.profile,
      bundles,
    },
  };
  return true;
}

function managedPatchYaml(genUiOn, subagentOn, bundles) {
  const inTree = new Set(bundles);
  const lines = [];
  if (!genUiOn && inTree.has(GENUI.name)) {
    lines.push(`- id: ${GENUI.entryId}`, '  disabled: true', '');
  }
  if (!subagentOn && inTree.has(SUBAGENT.name)) {
    lines.push(`- id: ${SUBAGENT.entryId}`, '  disabled: true', '');
    lines.push(`- id: ${SUBAGENT.restoreId}`, '  disabled: false', '');
  }
  return lines.join('\n');
}

function stripManagedBlock(text) {
  const begin = text.indexOf(PATCH_BEGIN);
  const end = text.indexOf(PATCH_END);
  if (begin === -1 || end === -1 || end < begin) {
    return text;
  }
  return `${text.slice(0, begin)}${text.slice(end + PATCH_END.length)}`;
}

function headerComments(text) {
  const lines = text.split(/\r?\n/);
  const header = [];
  for (const line of lines) {
    if (line.trim() === '' && header.length === 0) {
      continue;
    }
    if (line.trim() === '' || line.trim().startsWith('#')) {
      header.push(line);
      continue;
    }
    break;
  }
  while (header.length && header[header.length - 1].trim() === '') {
    header.pop();
  }
  return header.length ? `${header.join('\n')}\n` : `${DEFAULT_PATCH_HEADER}\n`;
}

function userPatchBody(text) {
  const withoutManaged = stripManagedBlock(text);
  const header = headerComments(withoutManaged);
  let body = withoutManaged.slice(header.length).trim();
  if (body === '[]') {
    body = '';
  }
  return body;
}

function composePatchFile(existing, managedYaml) {
  const source = existing && existing.trim() ? existing : `${DEFAULT_PATCH_HEADER}\n[]\n`;
  const stripped = stripManagedBlock(source);
  const header = headerComments(stripped);
  const userBody = userPatchBody(source);
  const parts = [header.trimEnd()];
  if (managedYaml.trim()) {
    parts.push('', PATCH_BEGIN, managedYaml.trimEnd(), PATCH_END);
  }
  if (userBody) {
    parts.push('', userBody);
  } else if (!managedYaml.trim()) {
    parts.push('[]');
  }
  return `${parts.join('\n').trimEnd()}\n`;
}

function syncPatchFile(genUiOn, subagentOn, bundles) {
  const file = patchPath();
  let existing = '';
  try {
    existing = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  const next = composePatchFile(existing, managedPatchYaml(genUiOn, subagentOn, bundles));
  if (next === existing) {
    return false;
  }
  writeAtomic(file, next);
  return true;
}

function applyPluginToggles(config = {}) {
  const genUiOn = flagOn(config.pluginGenUi);
  const subagentOn = flagOn(config.pluginSubagent);
  const file = manifestPath();
  if (!fs.existsSync(file)) {
    return { ok: false, reason: 'missing-profile' };
  }
  const manifest = readJson(file);
  const bundlesChanged = syncBundles(manifest, genUiOn, subagentOn);
  if (bundlesChanged) {
    writeAtomic(file, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const bundles = manifest.dsh?.profile?.bundles || [];
  const patchChanged = syncPatchFile(genUiOn, subagentOn, bundles);
  return { ok: true, bundlesChanged, patchChanged, bundles };
}

module.exports = {
  applyPluginToggles,
  pluginAbout,
  GENUI,
  SUBAGENT,
};
