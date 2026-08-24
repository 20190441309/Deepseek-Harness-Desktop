'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { getDesktopDshHome, tryGetDesktopDshHome } = require('../shared/dsh-home');
const { DROPPED, OFFICIAL_TEMPLATE_BUNDLES, listInstalledPlugins } = require('./plugins');
const { isValidGithubSpec, isValidPackageName } = require('../host/install-dsh-plugin-client');

const SESSION_LOG = /^session\.jsonl(\.zstd)?$/i;
const SESSION_PLAIN = /^session\.jsonl$/i;
const SESSION_ZSTD = /^session\.jsonl\.zstd$/i;
/** Harness preset/fixture sessions under official `_no-cwd/preset-*`; not user import candidates. */
const HARNESS_PRESET_SESSION_REL = /^_no-cwd\/preset-/;

function isHarnessPresetSessionRel(rel) {
  return HARNESS_PRESET_SESSION_REL.test(String(rel || ''));
}
const UNSUPPORTED_DB = /\.db$/i;
const PATH_TRAVERSAL = /(^|[\\/])\.\.([\\/]|$)/;
const LOCAL_SPEC = /^(file:|link:|workspace:)/i;
/** Registry semver spec from the official profile manifest (`1.2.3`, `^1.2.3`, `~1.2.3`). */
const REGISTRY_SEMVER_SPEC = /^[\^~]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const MCP_FILE = 'mcp-servers.yaml';
const SKILL_DOC = 'SKILL.md';
const ZSTD_MAGIC = 0xFD2FB528;

function officialDshHome() {
  return path.join(os.homedir(), '.dsh');
}

function defaultAgentsSkillsRoot() {
  return path.join(os.homedir(), '.agents', 'skills');
}

function resolveSourceHome(sourceHome) {
  const raw = typeof sourceHome === 'string' && sourceHome.trim() ? sourceHome.trim() : officialDshHome();
  return path.resolve(raw);
}

function destHome(explicit) {
  if (typeof explicit === 'string' && explicit.trim()) {
    return path.resolve(explicit.trim());
  }
  return tryGetDesktopDshHome() || getDesktopDshHome();
}

function journalPath(userDataDir) {
  return path.join(userDataDir, 'import-journal.json');
}

function isUnsafeRel(rel) {
  return !rel || PATH_TRAVERSAL.test(rel) || path.isAbsolute(rel);
}

function isInside(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const rel = path.relative(resolvedRoot, resolvedTarget);
  return rel === '' || (Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function walkSessionDirs(sessionsRoot) {
  const found = [];
  if (!fs.existsSync(sessionsRoot)) {
    return found;
  }
  const stack = [sessionsRoot];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const logs = entries.filter((entry) => entry.isFile() && SESSION_LOG.test(entry.name));
    const dbs = entries.filter((entry) => entry.isFile() && UNSUPPORTED_DB.test(entry.name));
    if (logs.length) {
      const encodings = new Set(logs.map((entry) => (entry.name.endsWith('.zstd') ? 'zstd' : 'plain')));
      found.push({
        abs: dir,
        rel: path.relative(sessionsRoot, dir).split(path.sep).join('/'),
        logs: logs.map((entry) => entry.name),
        mixedEncoding: encodings.size > 1,
        unsupported: false,
      });
      continue;
    }
    if (dbs.length) {
      found.push({
        abs: dir,
        rel: path.relative(sessionsRoot, dir).split(path.sep).join('/'),
        logs: dbs.map((entry) => entry.name),
        mixedEncoding: false,
        unsupported: true,
      });
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== '.' && entry.name !== '..') {
        stack.push(path.join(dir, entry.name));
      }
    }
  }
  return found.sort((a, b) => a.rel.localeCompare(b.rel));
}

function emptySessionMeta() {
  return {
    id: '',
    cwd: '',
    title: '',
    createdAt: '',
    compressedLog: false,
  };
}

function idFromSessionRel(rel) {
  const text = String(rel || '');
  const slash = text.lastIndexOf('/');
  return slash === -1 ? text : text.slice(slash + 1);
}

/**
 * Fold one JSONL line into display meta. Last `session/title` wins.
 * @param {{ id: string, cwd: string, title: string, createdAt: string }} meta
 * @param {string} line
 */
function applySessionJsonlLine(meta, line) {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    return;
  }
  if (!row || typeof row !== 'object') {
    return;
  }
  if (row.type === 'session') {
    if (typeof row.id === 'string' && row.id) {
      meta.id = row.id;
    }
    if (typeof row.cwd === 'string' && row.cwd) {
      meta.cwd = row.cwd;
    }
    if (typeof row.createdAt === 'number' && Number.isFinite(row.createdAt)) {
      meta.createdAt = String(row.createdAt);
    } else if (typeof row.createdAt === 'string' && row.createdAt) {
      meta.createdAt = row.createdAt;
    }
    return;
  }
  if (row.type === 'session/title') {
    const title = row.data && typeof row.data.title === 'string'
      ? row.data.title
      : (typeof row.title === 'string' ? row.title : '');
    if (title.trim()) {
      meta.title = title.trim();
    }
  }
}

function foldSessionJsonlText(meta, text) {
  const chunks = String(text || '').split(/\n/);
  for (const line of chunks) {
    if (line) {
      applySessionJsonlLine(meta, line);
    }
  }
}

/**
 * Locate complete concatenated Zstandard frames (harness session layout).
 * Port of vendor scanZstdFrames; fail-soft callers catch thrown errors.
 * @param {Buffer} buffer
 * @returns {{ start: number, end: number }[]}
 */
function scanZstdFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) {
      break;
    }
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      throw new Error(`invalid zstd magic at ${offset}`);
    }
    offset += 4;
    if (offset === buffer.length) {
      break;
    }
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 0x18) !== 0) {
      throw new Error(`reserved zstd frame-header bit at ${offset - 1}`);
    }
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 0x20) !== 0;
    const checksum = (descriptor & 0x04) !== 0;
    const dictionaryFlag = descriptor & 0x03;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0
      ? (singleSegment ? 1 : 0)
      : (1 << contentSizeFlag);
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) {
      break;
    }
    offset += remainingHeaderBytes;
    for (;;) {
      if (buffer.length - offset < 3) {
        return frames;
      }
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 0x03;
      const blockSize = blockHeader >>> 3;
      if (blockType === 0x03) {
        throw new Error(`reserved zstd block type at ${offset - 3}`);
      }
      const payloadBytes = blockType === 0x01 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) {
        return frames;
      }
      offset += payloadBytes;
      if (lastBlock) {
        break;
      }
    }
    if (checksum) {
      if (buffer.length - offset < 4) {
        return frames;
      }
      offset += 4;
    }
    frames.push({ start, end: offset });
  }
  return frames;
}

function readPlainSessionMeta(file) {
  const meta = emptySessionMeta();
  try {
    foldSessionJsonlText(meta, fs.readFileSync(file, 'utf8'));
  } catch {
    // corrupt or unreadable log — keep empty meta
  }
  return meta;
}

function readZstdSessionMeta(file) {
  const meta = emptySessionMeta();
  meta.compressedLog = true;
  if (typeof zlib.zstdDecompressSync !== 'function') {
    return meta;
  }
  let buffer;
  try {
    buffer = fs.readFileSync(file);
  } catch {
    return meta;
  }
  let frames;
  try {
    frames = scanZstdFrames(buffer);
  } catch {
    return meta;
  }
  if (!frames.length) {
    return meta;
  }
  meta.compressedLog = false;
  for (const frame of frames) {
    try {
      const text = zlib.zstdDecompressSync(buffer.subarray(frame.start, frame.end)).toString('utf8');
      foldSessionJsonlText(meta, text);
    } catch {
      // skip one bad frame; keep prior meta
    }
  }
  return meta;
}

/**
 * Read display fields from a session dir without changing the import key (`rel`).
 * Prefers plaintext `session.jsonl`; otherwise uses Node built-in zstd (no extra dep).
 * @param {{ abs: string, rel: string, logs: string[], unsupported: boolean }} row
 */
function readSessionDisplayMeta(row) {
  if (!row || row.unsupported) {
    return {
      ...emptySessionMeta(),
      id: idFromSessionRel(row && row.rel),
    };
  }
  const logs = Array.isArray(row.logs) ? row.logs : [];
  const plain = logs.find((name) => SESSION_PLAIN.test(name));
  if (plain) {
    const meta = readPlainSessionMeta(path.join(row.abs, plain));
    if (!meta.id) {
      meta.id = idFromSessionRel(row.rel);
    }
    return meta;
  }
  const zstd = logs.find((name) => SESSION_ZSTD.test(name));
  if (zstd) {
    const meta = readZstdSessionMeta(path.join(row.abs, zstd));
    if (!meta.id) {
      meta.id = idFromSessionRel(row.rel);
    }
    return meta;
  }
  return {
    ...emptySessionMeta(),
    id: idFromSessionRel(row.rel),
  };
}

/**
 * Best-effort `name` from SKILL.md YAML frontmatter.
 * @param {string} skillDir
 * @returns {string}
 */
function readSkillDisplayName(skillDir) {
  try {
    const text = fs.readFileSync(path.join(skillDir, SKILL_DOC), 'utf8');
    const fence = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fence) {
      return '';
    }
    const match = fence[1].match(/^name:\s*(.+)\s*$/m);
    if (!match) {
      return '';
    }
    let value = match[1].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value.trim();
  } catch {
    return '';
  }
}

function destHasSession(destSessions, rel) {
  const target = path.join(destSessions, ...rel.split('/'));
  if (!fs.existsSync(target)) {
    return false;
  }
  try {
    return fs.readdirSync(target).some((name) => SESSION_LOG.test(name));
  } catch {
    return false;
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Reinstall spec for one manifest row, or null when the row cannot be
 * reinstalled through a supported channel. Supported channels:
 * - `github:owner/repo[#ref]` specs (existing marketplace channel);
 * - registry semver specs, reinstalled as `name@<semver>` (`dsh plugin add`).
 * Anything else (tarball URLs, git+ URLs, npm aliases, dist-tags) must not
 * reach `pnpm add`, so the scan pre-marks it `unsupported`.
 * @param {string} name - manifest dependency name.
 * @param {string} spec - manifest dependency spec.
 * @returns {string | null}
 */
function pluginReinstallSpec(name, spec) {
  const value = String(spec || '').trim();
  if (isValidGithubSpec(value)) {
    return value;
  }
  if (isValidPackageName(name) && REGISTRY_SEMVER_SPEC.test(value)) {
    return `${name}@${value}`;
  }
  return null;
}

function pluginCandidates(sourceHome) {
  const manifest = readJson(path.join(sourceHome, 'profiles', 'web', 'package.json'));
  const dependencies = manifest?.dependencies && typeof manifest.dependencies === 'object'
    ? manifest.dependencies
    : {};
  const installed = new Set((listInstalledPlugins().plugins || []).map((row) => row.name));
  return Object.entries(dependencies).map(([name, spec]) => {
    const value = String(spec || '').trim();
    const reason = OFFICIAL_TEMPLATE_BUNDLES.has(name)
      ? 'template'
      : DROPPED.includes(name)
        ? 'dropped'
        : LOCAL_SPEC.test(value)
          ? 'local-spec'
          : pluginReinstallSpec(name, value) === null
            ? 'unsupported'
            : '';
    return {
      name,
      spec: value,
      skipped: Boolean(reason),
      reason,
      alreadyInstalled: installed.has(name),
    };
  });
}

function coerceYaml(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    const inner = raw.slice(1, -1);
    try {
      return JSON.parse(raw.startsWith('"') ? raw : `"${inner.replace(/"/g, '\\"')}"`);
    } catch {
      return inner;
    }
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  if (raw === 'null' || raw === '~') {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }
  return raw;
}

function parseMcpServersYaml(text) {
  const servers = [];
  let current = null;
  let inHeaders = false;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) {
      continue;
    }
    const indent = rawLine.match(/^ */)[0].length;
    const line = rawLine.trim();
    if (line === 'servers:') {
      current = null;
      inHeaders = false;
      continue;
    }
    if (line.startsWith('- ')) {
      current = {};
      servers.push(current);
      inHeaders = false;
      const rest = line.slice(2).trim();
      if (rest.includes(':')) {
        const idx = rest.indexOf(':');
        const key = rest.slice(0, idx).trim();
        const val = rest.slice(idx + 1);
        if (key === 'headers' && !String(val).trim()) {
          inHeaders = true;
          current.headers = {};
        } else {
          current[key] = coerceYaml(val);
        }
      }
      continue;
    }
    if (!current) {
      continue;
    }
    const idx = line.indexOf(':');
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1);
    if (key === 'headers' && !String(val).trim()) {
      inHeaders = true;
      current.headers = {};
      continue;
    }
    if (inHeaders && indent >= 6) {
      current.headers = current.headers || {};
      current.headers[key] = coerceYaml(val);
      continue;
    }
    inHeaders = false;
    current[key] = coerceYaml(val);
  }
  return servers.filter((row) => row && row.id != null && String(row.id));
}

function readMcpServers(home) {
  const file = path.join(home, MCP_FILE);
  if (!fs.existsSync(file)) {
    return [];
  }
  try {
    return parseMcpServersYaml(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function dumpYamlScalar(value) {
  if (value === true || value === false) {
    return String(value);
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  const text = String(value);
  if (text === '' || /[:#{}[\],&*?!|>%@`]|^\s|\s$|\n/.test(text)) {
    return JSON.stringify(text);
  }
  return text;
}

function dumpMcpServersYaml(servers) {
  const lines = ['servers:'];
  for (const server of servers) {
    let first = true;
    for (const [key, value] of Object.entries(server)) {
      if (key === 'headers' && value && typeof value === 'object' && !Array.isArray(value)) {
        lines.push(`${first ? '  - ' : '    '}headers:`);
        first = false;
        for (const [headerKey, headerVal] of Object.entries(value)) {
          lines.push(`      ${headerKey}: ${dumpYamlScalar(headerVal)}`);
        }
        continue;
      }
      if (Array.isArray(value)) {
        lines.push(`${first ? '  - ' : '    '}${key}:`);
        first = false;
        for (const item of value) {
          lines.push(`      - ${dumpYamlScalar(item)}`);
        }
        continue;
      }
      if (value && typeof value === 'object') {
        continue;
      }
      lines.push(`${first ? '  - ' : '    '}${key}: ${dumpYamlScalar(value)}`);
      first = false;
    }
  }
  return `${lines.join('\n')}\n`;
}

function publicMcpRow(server, destIds) {
  const id = String(server.id);
  return {
    id,
    name: server.serverName || server.name || id,
    endpoint: server.url || server.command || '',
    enabled: server.enabled !== false,
    conflict: destIds.has(id),
  };
}

function isSkillPackage(dir) {
  try {
    return fs.existsSync(path.join(dir, SKILL_DOC));
  } catch {
    return false;
  }
}

function listSkillPackages(root, prefix) {
  const found = [];
  if (!root || !fs.existsSync(root)) {
    return found;
  }
  let stat;
  try {
    stat = fs.statSync(root);
  } catch {
    return found;
  }
  if (!stat.isDirectory()) {
    return found;
  }
  if (isSkillPackage(root)) {
    const name = path.basename(root);
    if (!name.startsWith('.')) {
      found.push({
        id: `${prefix}:${name}`,
        name,
        displayName: readSkillDisplayName(root) || name,
        destName: name,
        abs: path.resolve(root),
        source: prefix,
      });
    }
    return found;
  }
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.' || entry.name === '..' || entry.name.startsWith('.')) {
      continue;
    }
    const abs = path.join(root, entry.name);
    if (!isSkillPackage(abs)) {
      continue;
    }
    found.push({
      id: `${prefix}:${entry.name}`,
      name: entry.name,
      displayName: readSkillDisplayName(abs) || entry.name,
      destName: entry.name,
      abs: path.resolve(abs),
      source: prefix,
    });
  }
  return found.sort((a, b) => a.id.localeCompare(b.id));
}

function collectSkills({ source, extraSkillDirs, agentsSkillsRoot, destSkills }) {
  const roots = [
    { prefix: 'home', dir: path.join(source, 'skills') },
    { prefix: 'agents', dir: agentsSkillsRoot || defaultAgentsSkillsRoot() },
  ];
  const extras = Array.isArray(extraSkillDirs) ? extraSkillDirs : [];
  extras.forEach((dir, index) => {
    if (typeof dir === 'string' && dir.trim()) {
      roots.push({ prefix: extras.length === 1 ? 'extra' : `extra${index}`, dir: path.resolve(dir.trim()) });
    }
  });
  const seen = new Set();
  const skills = [];
  for (const root of roots) {
    for (const row of listSkillPackages(root.dir, root.prefix)) {
      if (seen.has(row.id) || !isInside(root.dir, row.abs)) {
        continue;
      }
      seen.add(row.id);
      skills.push({
        ...row,
        conflict: destHasSkill(destSkills, row.destName),
      });
    }
  }
  return { skills, skillRoots: roots.map((row) => path.resolve(row.dir)) };
}

function destHasSkill(destSkills, name) {
  if (!name || isUnsafeRel(name)) {
    return false;
  }
  return isSkillPackage(path.join(destSkills, name));
}

function scanImport({
  sourceHome,
  destHome: dest,
  extraSkillDirs,
  agentsSkillsRoot,
} = {}) {
  const source = resolveSourceHome(sourceHome);
  const target = destHome(dest);
  const sourceSessions = path.join(source, 'sessions');
  const destSessions = path.join(target, 'sessions');
  const sessions = walkSessionDirs(sourceSessions)
    .filter((row) => !isHarnessPresetSessionRel(row.rel))
    .map((row) => {
      const meta = readSessionDisplayMeta(row);
      return {
        ...row,
        id: meta.id,
        cwd: meta.cwd,
        title: meta.title,
        createdAt: meta.createdAt,
        compressedLog: Boolean(meta.compressedLog),
        conflict: !row.unsupported && destHasSession(destSessions, row.rel),
      };
    });
  const attachmentsDir = path.join(source, 'attachments');
  const plugins = pluginCandidates(source);
  const { skills, skillRoots } = collectSkills({
    source,
    extraSkillDirs,
    agentsSkillsRoot,
    destSkills: path.join(target, 'skills'),
  });
  const destMcpIds = new Set(readMcpServers(target).map((row) => String(row.id)));
  const mcp = readMcpServers(source).map((row) => publicMcpRow(row, destMcpIds));
  const hasAttachments = fs.existsSync(attachmentsDir);
  const sourceHasData = sessions.some((row) => !row.unsupported)
    || hasAttachments
    || skills.length > 0
    || plugins.some((row) => !row.skipped)
    || mcp.length > 0;
  return {
    sourceHome: source,
    destHome: target,
    homeDir: os.homedir(),
    destEmpty: walkSessionDirs(destSessions).length === 0,
    sourceHasData,
    sessions,
    plugins,
    skills,
    mcp,
    skillRoots,
    extraSkillDirs: Array.isArray(extraSkillDirs) ? extraSkillDirs.filter(Boolean) : [],
    hasAttachments,
  };
}

function shouldHoldForImport(scan) {
  return Boolean(scan && scan.destEmpty && scan.sourceHasData);
}

function writeJournal(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function readImportJournal(userDataDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(journalPath(userDataDir), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function removeImportTmpDirs(root) {
  const removed = [];
  if (!root || !fs.existsSync(root)) {
    return removed;
  }
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const abs = path.join(dir, entry.name);
      if (entry.name.endsWith('.import-tmp')) {
        try {
          fs.rmSync(abs, { recursive: true, force: true });
          removed.push(abs);
        } catch {
          // Leftover staging dirs that cannot be removed stay harmless: the
          // next copyDirAtomic clears its own target tmp before copying.
        }
        continue;
      }
      stack.push(abs);
    }
  }
  return removed.sort();
}

function samePath(left, right) {
  const a = path.resolve(String(left || ''));
  const b = path.resolve(String(right || ''));
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * Consume a `phase: 'copying'` journal left behind by a crash mid-import:
 * remove stale `.import-tmp` staging dirs under the desktop home (sessions,
 * skills, and the attachments staging dir) and mark the journal `recovered`
 * so the launcher can tell the user to re-run the idempotent, conflict-
 * skipping import. Only the journal's own destHome is cleaned, and only when
 * it matches the resolved desktop home; official sources are never touched.
 * @param {{ userDataDir?: string, destHome?: string }} [options]
 * @returns {{ recovered: boolean, removedTmp: string[] }}
 */
function recoverInterruptedImport({ userDataDir, destHome: dest } = {}) {
  const target = destHome(dest);
  const journalDir = userDataDir || path.join(target, '..');
  const journal = readImportJournal(journalDir);
  if (!journal || journal.phase !== 'copying') {
    return { recovered: false, removedTmp: [] };
  }
  if (!samePath(journal.destHome, target)) {
    return { recovered: false, removedTmp: [] };
  }
  const removedTmp = [
    ...removeImportTmpDirs(path.join(target, 'sessions')),
    ...removeImportTmpDirs(path.join(target, 'skills')),
  ];
  const attachmentsTmp = path.join(target, 'attachments.import-tmp');
  if (fs.existsSync(attachmentsTmp)) {
    try {
      fs.rmSync(attachmentsTmp, { recursive: true, force: true });
      removedTmp.push(attachmentsTmp);
    } catch {
      // Same as above: a stuck staging dir does not block the re-run.
    }
  }
  writeJournal(journalPath(journalDir), {
    ...journal,
    phase: 'recovered',
    recoveredAt: new Date().toISOString(),
    removedTmp,
  });
  return { recovered: true, removedTmp };
}

function copyDirAtomic(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const tmp = `${to}.import-tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.cpSync(from, tmp, { recursive: true });
  fs.rmSync(to, { recursive: true, force: true });
  fs.renameSync(tmp, to);
}

function importSessions({
  sourceHome,
  destHome: dest,
  selectedRels,
  overwrite = false,
  userDataDir,
  extraSkillDirs,
  agentsSkillsRoot,
  importAttachments,
} = {}) {
  const scan = scanImport({ sourceHome, destHome: dest, extraSkillDirs, agentsSkillsRoot });
  const chosen = Array.isArray(selectedRels) ? selectedRels : scan.sessions.map((row) => row.rel);
  const journalFile = journalPath(userDataDir || path.join(scan.destHome, '..'));
  const results = [];
  writeJournal(journalFile, { phase: 'copying', sourceHome: scan.sourceHome, destHome: scan.destHome, items: [] });

  const byRel = new Map(scan.sessions.map((row) => [row.rel, row]));
  for (const rel of chosen) {
    if (isUnsafeRel(rel)) {
      results.push({ rel, status: 'rejected', error: 'invalid-path' });
      continue;
    }
    const row = byRel.get(rel);
    if (!row) {
      results.push({ rel, status: 'missing' });
      continue;
    }
    if (row.unsupported || row.mixedEncoding) {
      results.push({ rel, status: 'unsupported' });
      continue;
    }
    if (row.conflict && !overwrite) {
      results.push({ rel, status: 'skipped' });
      continue;
    }
    try {
      copyDirAtomic(row.abs, path.join(scan.destHome, 'sessions', ...rel.split('/')));
      results.push({ rel, status: 'copied' });
    } catch (error) {
      results.push({ rel, status: 'failed', error: error.message || String(error) });
    }
  }

  let attachments = 'absent';
  const shouldCopyAttachments = importAttachments !== false;
  const sourceAttachments = path.join(scan.sourceHome, 'attachments');
  if (shouldCopyAttachments && fs.existsSync(sourceAttachments)) {
    try {
      copyDirAtomic(sourceAttachments, path.join(scan.destHome, 'attachments'));
      attachments = 'copied';
    } catch (error) {
      attachments = `failed:${error.message || String(error)}`;
    }
  }

  writeJournal(journalFile, {
    phase: 'done',
    sourceHome: scan.sourceHome,
    destHome: scan.destHome,
    items: results,
    attachments,
  });
  return { ok: results.every((row) => row.status !== 'failed'), sessions: results, attachments, journal: journalFile };
}

async function importPlugins({
  sourceHome,
  destHome: dest,
  selectedNames,
  overwrite = false,
  installPlugin,
  extraSkillDirs,
  agentsSkillsRoot,
} = {}) {
  const scan = scanImport({ sourceHome, destHome: dest, extraSkillDirs, agentsSkillsRoot });
  const chosen = new Set(
    Array.isArray(selectedNames)
      ? selectedNames
      : scan.plugins.filter((row) => !row.skipped).map((row) => row.name),
  );
  if (Array.isArray(selectedNames) && chosen.size === 0) {
    return { ok: true, plugins: [] };
  }
  const run = typeof installPlugin === 'function' ? installPlugin : null;
  const results = [];
  if (!run) {
    return { ok: false, error: 'missing-installer', plugins: results };
  }
  for (const row of scan.plugins) {
    if (!chosen.has(row.name)) {
      continue;
    }
    if (row.skipped) {
      results.push({ name: row.name, status: 'skipped', reason: row.reason });
      continue;
    }
    if (row.alreadyInstalled && !overwrite) {
      results.push({ name: row.name, status: 'skipped', reason: 'installed' });
      continue;
    }
    const spec = pluginReinstallSpec(row.name, row.spec);
    if (spec === null) {
      results.push({ name: row.name, status: 'skipped', reason: 'unsupported' });
      continue;
    }
    try {
      const installed = await run(spec);
      results.push({
        name: row.name,
        status: installed?.ok === false ? 'failed' : 'installed',
        error: installed?.error,
      });
    } catch (error) {
      results.push({ name: row.name, status: 'failed', error: error.message || String(error) });
    }
  }
  return { ok: results.every((row) => row.status !== 'failed'), plugins: results };
}

function destNameFromSkillId(id) {
  const text = String(id || '');
  const idx = text.indexOf(':');
  return idx === -1 ? text : text.slice(idx + 1);
}

function importSkills({ scan, selectedIds, overwrite }) {
  const chosen = Array.isArray(selectedIds) ? selectedIds : [];
  const byId = new Map((scan.skills || []).map((row) => [row.id, row]));
  const results = [];
  for (const id of chosen) {
    const destName = destNameFromSkillId(id);
    if (isUnsafeRel(destName)) {
      results.push({ id, status: 'rejected', error: 'invalid-path' });
      continue;
    }
    const row = byId.get(id);
    if (!row) {
      results.push({ id, status: 'missing' });
      continue;
    }
    const allowed = (scan.skillRoots || []).some((root) => isInside(root, row.abs));
    if (!allowed || isUnsafeRel(row.destName)) {
      results.push({ id, status: 'rejected', error: 'invalid-path' });
      continue;
    }
    if (row.conflict && !overwrite) {
      results.push({ id, status: 'skipped' });
      continue;
    }
    try {
      copyDirAtomic(row.abs, path.join(scan.destHome, 'skills', row.destName));
      results.push({ id, status: 'copied' });
    } catch (error) {
      results.push({ id, status: 'failed', error: error.message || String(error) });
    }
  }
  return results;
}

function importMcp({ scan, selectedIds, overwrite }) {
  const chosen = Array.isArray(selectedIds) ? selectedIds : [];
  const results = [];
  if (!chosen.length) {
    return results;
  }
  const sourceServers = readMcpServers(scan.sourceHome);
  const destFile = path.join(scan.destHome, MCP_FILE);
  const destExisted = fs.existsSync(destFile);
  const destServers = destExisted ? readMcpServers(scan.destHome) : [];
  const destById = new Map(destServers.map((row) => [String(row.id), row]));
  let changed = false;
  for (const id of chosen) {
    const record = sourceServers.find((row) => String(row.id) === String(id));
    if (!record) {
      results.push({ id, status: 'missing' });
      continue;
    }
    if (destById.has(String(id)) && !overwrite) {
      results.push({ id, status: 'skipped' });
      continue;
    }
    destById.set(String(id), record);
    changed = true;
    results.push({ id, status: 'copied' });
  }
  if (changed) {
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.writeFileSync(destFile, dumpMcpServersYaml([...destById.values()]));
  }
  return results;
}

async function runImport(options = {}) {
  const selectedRels = Array.isArray(options.selectedRels) ? options.selectedRels : [];
  const selectedSkillIds = Array.isArray(options.selectedSkillIds) ? options.selectedSkillIds : [];
  const selectedPluginNames = Array.isArray(options.selectedPluginNames) ? options.selectedPluginNames : [];
  const selectedMcpIds = Array.isArray(options.selectedMcpIds) ? options.selectedMcpIds : [];
  const importAttachments = options.importAttachments === true;
  const empty = selectedRels.length === 0
    && selectedSkillIds.length === 0
    && selectedPluginNames.length === 0
    && selectedMcpIds.length === 0
    && !importAttachments;
  const scan = scanImport(options);
  const journalFile = journalPath(options.userDataDir || path.join(scan.destHome, '..'));
  if (empty) {
    writeJournal(journalFile, {
      phase: 'done',
      sourceHome: scan.sourceHome,
      destHome: scan.destHome,
      empty: true,
      items: [],
    });
    return {
      ok: true,
      empty: true,
      sessions: [],
      skills: [],
      plugins: [],
      mcp: [],
      attachments: 'absent',
      journal: journalFile,
    };
  }

  const sessions = importSessions({
    ...options,
    selectedRels,
    importAttachments,
  });
  const skills = importSkills({ scan, selectedIds: selectedSkillIds, overwrite: options.overwrite === true });
  const plugins = await importPlugins({
    ...options,
    selectedNames: selectedPluginNames,
  });
  const mcp = importMcp({ scan, selectedIds: selectedMcpIds, overwrite: options.overwrite === true });
  writeJournal(journalFile, {
    phase: 'done',
    sourceHome: scan.sourceHome,
    destHome: scan.destHome,
    sessions: sessions.sessions,
    skills,
    plugins: plugins.plugins,
    mcp,
    attachments: sessions.attachments,
  });
  const ok = sessions.ok
    && plugins.ok
    && skills.every((row) => row.status !== 'failed')
    && mcp.every((row) => row.status !== 'failed');
  return {
    ok,
    empty: false,
    sessions: sessions.sessions,
    skills,
    plugins: plugins.plugins,
    mcp,
    attachments: sessions.attachments,
    journal: journalFile,
  };
}

module.exports = {
  officialDshHome,
  scanImport,
  shouldHoldForImport,
  importSessions,
  importPlugins,
  pluginReinstallSpec,
  recoverInterruptedImport,
  readImportJournal,
  runImport,
  journalPath,
  SESSION_LOG,
};
