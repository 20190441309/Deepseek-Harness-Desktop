'use strict';

const GENERIC_OOM = /heap out of memory|js heap|allocation failed|oom\b/i;
const GENERIC_PORT = /eaddrinuse|address already in use/i;
const GENERIC_NODE = /node['"]?\s+is not recognized|cannot find node|enoent.*node(\.exe)?\b/i;

const BUNDLE_RE = /cannot resolve profile bundle ['"]([^'"]+)['"]/gi;
const PACKAGE_RE = /cannot find package ['"]([^'"]+)['"]/gi;
const MODULE_RE = /err_module_not_found[^\n'"]*['"]([^'"]+)['"]/gi;
const COMPOSE_RE = /failed to compose[^\n]*['"](@?[\w./-]+)['"]/gi;

const PRESET_PLUGINS = new Set(['dshmarket', 'dsh-usage-panel']);

function classifyGenericFailure(text) {
  const blob = String(text || '');
  if (GENERIC_OOM.test(blob)) return 'oom';
  if (GENERIC_PORT.test(blob)) return 'port-in-use';
  if (GENERIC_NODE.test(blob)) return 'missing-node';
  return '';
}

function collectMatches(regex, text) {
  const names = [];
  const blob = String(text || '');
  regex.lastIndex = 0;
  let match = regex.exec(blob);
  while (match) {
    if (match[1]) names.push(match[1]);
    match = regex.exec(blob);
  }
  return names;
}

function extractSuspectNames(text) {
  const blob = String(text || '');
  return [...new Set([
    ...collectMatches(BUNDLE_RE, blob),
    ...collectMatches(PACKAGE_RE, blob),
    ...collectMatches(MODULE_RE, blob),
    ...collectMatches(COMPOSE_RE, blob),
  ])];
}

function inspectPlugins({ logs, plugins, bundles, disabledPlugins } = {}) {
  const text = Array.isArray(logs) ? logs.join('\n') : String(logs || '');
  const genericCause = classifyGenericFailure(text);
  const suspects = genericCause ? [] : extractSuspectNames(text);
  const suspectSet = new Set(suspects);
  const disabled = new Set(Array.isArray(disabledPlugins) ? disabledPlugins : []);
  const bundleSet = new Set(Array.isArray(bundles) ? bundles : []);
  const rows = (plugins || []).map((row) => {
    const name = row.name || row;
    return {
      name,
      spec: row.spec || '',
      bundle: bundleSet.has(name) || row.bundle === true,
      preset: PRESET_PLUGINS.has(name),
      disabled: disabled.has(name) || row.disabled === true,
      suspect: suspectSet.has(name),
    };
  });
  return {
    genericCause: genericCause || null,
    suspects: suspects.map((name) => ({ name })),
    plugins: rows,
  };
}

function isPresetPlugin(name) {
  return PRESET_PLUGINS.has(String(name || ''));
}

module.exports = {
  PRESET_PLUGINS,
  classifyGenericFailure,
  extractSuspectNames,
  inspectPlugins,
  isPresetPlugin,
};
