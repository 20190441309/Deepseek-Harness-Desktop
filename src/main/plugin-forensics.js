'use strict';

const { OFFICIAL_TEMPLATE_BUNDLES } = require('./plugins');

const GENERIC_OOM = /heap out of memory|js heap|allocation failed|oom\b/i;
const GENERIC_PORT = /eaddrinuse|address already in use/i;
const GENERIC_NODE = /node['"]?\s+is not recognized|cannot find node|enoent.*node(\.exe)?\b/i;

const EVIDENCE_PATTERNS = [
  { kind: 'bundle', regex: /cannot resolve profile bundle ['"]([^'"]+)['"]/gi },
  { kind: 'package', regex: /cannot find package ['"]([^'"]+)['"]/gi },
  { kind: 'module', regex: /err_module_not_found[^\n'"]*['"]([^'"]+)['"]/gi },
  { kind: 'compose', regex: /failed to compose[^\n]*['"](@?[\w./-]+)['"]/gi },
];

// Usage panel remains a soft desktop preset; dsh-im is first-party Remote
// channels (vendor/dsh-im) but still appears on the Recovery Board toggle list.
const PRESET_PLUGINS = new Set(['dsh-usage-panel', '@xmanrui/dsh-im', 'dsh-im', 'xmanrui-dsh-im']);
const EVIDENCE_LINE_MAX = 240;

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
  const names = [];
  for (const { regex } of EVIDENCE_PATTERNS) {
    names.push(...collectMatches(regex, text));
  }
  return [...new Set(names)];
}

function truncateLine(line) {
  const text = String(line || '').trim();
  if (text.length <= EVIDENCE_LINE_MAX) {
    return text;
  }
  return `${text.slice(0, EVIDENCE_LINE_MAX - 1)}…`;
}

/**
 * @param {string} corpus
 * @returns {Array<{ name: string, line: string }>}
 */
function extractEvidence(corpus) {
  const blob = String(corpus || '');
  const lines = blob.split('\n');
  const evidence = [];
  const seen = new Set();
  for (const rawLine of lines) {
    for (const { regex } of EVIDENCE_PATTERNS) {
      regex.lastIndex = 0;
      let match = regex.exec(rawLine);
      while (match) {
        const name = match[1];
        const key = `${name}\0${rawLine}`;
        if (name && !seen.has(key)) {
          seen.add(key);
          evidence.push({ name, line: truncateLine(rawLine) });
        }
        match = regex.exec(rawLine);
      }
    }
  }
  return evidence;
}

function buildForensicsSummary(forensics) {
  if (!forensics || typeof forensics !== 'object') {
    return {
      genericCause: null,
      suspectCount: 0,
      pluginTreeFailure: false,
      hasOrphans: false,
    };
  }
  const suspects = Array.isArray(forensics.suspects) ? forensics.suspects : [];
  const orphans = Array.isArray(forensics.orphanSuspects) ? forensics.orphanSuspects : [];
  return {
    genericCause: forensics.genericCause || null,
    suspectCount: suspects.length + orphans.length,
    pluginTreeFailure: Boolean(forensics.pluginTreeFailure),
    hasOrphans: orphans.length > 0,
  };
}

function inspectPlugins({
  logs,
  lastStartError,
  pluginTreeFailure,
  recovery,
  plugins,
  bundles,
  disabledPlugins,
} = {}) {
  const logText = Array.isArray(logs) ? logs.join('\n') : String(logs || '');
  const corpus = [logText, lastStartError].filter(Boolean).join('\n');
  const genericCause = classifyGenericFailure(corpus);
  const suspects = genericCause ? [] : extractSuspectNames(corpus);
  const suspectSet = new Set(suspects);
  const disabled = new Set(Array.isArray(disabledPlugins) ? disabledPlugins : []);
  const bundleSet = new Set(Array.isArray(bundles) ? bundles : []);
  const pluginNames = new Set((plugins || []).map((row) => row.name || row));
  const rows = (plugins || []).map((row) => {
    const name = row.name || row;
    return {
      name,
      spec: row.spec || '',
      bundle: bundleSet.has(name) || row.bundle === true,
      preset: PRESET_PLUGINS.has(name),
      officialTemplate: OFFICIAL_TEMPLATE_BUNDLES.has(name),
      disabled: disabled.has(name) || row.disabled === true,
      suspect: suspectSet.has(name),
      orphan: false,
    };
  });
  const orphanSuspects = suspects
    .filter((name) => !pluginNames.has(name))
    .map((name) => ({
      name,
      spec: '',
      bundle: false,
      preset: PRESET_PLUGINS.has(name),
      officialTemplate: OFFICIAL_TEMPLATE_BUNDLES.has(name),
      disabled: disabled.has(name),
      suspect: true,
      orphan: true,
    }));
  const evidence = extractEvidence(corpus);
  const payload = {
    genericCause: genericCause || null,
    pluginTreeFailure: Boolean(pluginTreeFailure),
    recovery: recovery && typeof recovery === 'object'
      ? {
          skipUserPlugins: recovery.skipUserPlugins === true,
          reason: typeof recovery.reason === 'string' ? recovery.reason : '',
          at: typeof recovery.at === 'string' ? recovery.at : '',
          appVersion: typeof recovery.appVersion === 'string' ? recovery.appVersion : '',
        }
      : { skipUserPlugins: false, reason: '', at: '', appVersion: '' },
    suspects: suspects.map((name) => ({ name })),
    orphanSuspects,
    evidence,
    plugins: rows,
  };
  payload.summary = buildForensicsSummary(payload);
  return payload;
}

function isPresetPlugin(name) {
  return PRESET_PLUGINS.has(String(name || ''));
}

module.exports = {
  PRESET_PLUGINS,
  EVIDENCE_LINE_MAX,
  classifyGenericFailure,
  extractSuspectNames,
  extractEvidence,
  buildForensicsSummary,
  inspectPlugins,
  isPresetPlugin,
};
