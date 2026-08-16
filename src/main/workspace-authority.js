const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * Workspace authority: the trust roots for desktop capabilities that touch
 * the filesystem (git, PTY, file browse/read). Every renderer-supplied cwd
 * must resolve inside the configured boot workspace or a workspace the
 * running harness registry has already persisted. A third-party plugin
 * installed through the marketplace must not be able to drive `shell.gitPush`
 * or `shell.readFile` against an arbitrary directory using the user's
 * credentials.
 * @param {{
 *   workspace?: string,
 *   extraWorkspaces?: unknown,
 *   listRegisteredWorkspaces?: () => unknown,
 * }} options - boot workspace plus optional extra roots.
 */
function createWorkspaceAuthority({
  workspace = '',
  extraWorkspaces = [],
  listRegisteredWorkspaces,
} = {}) {
  function bootRoot() {
    return typeof workspace === 'string' && workspace.trim() !== ''
      ? path.resolve(workspace)
      : null;
  }

  /**
   * The configured boot filesystem root (null when none is configured).
   * Extra harness-registered roots are not this value; use
   * {@link authorizedRoots} for the live allowlist.
   */
  function authorizedRoot() {
    return bootRoot();
  }

  /** Live allowlist: boot workspace plus every extra / registered root. */
  function authorizedRoots() {
    return collectRoots([bootRoot(), ...listExtras()]);
  }

  function listExtras() {
    const extras = Array.isArray(extraWorkspaces) ? extraWorkspaces : [];
    const listed = typeof listRegisteredWorkspaces === 'function'
      ? safeListedWorkspaces(listRegisteredWorkspaces)
      : [];
    return [...extras, ...listed];
  }

  /**
   * Accept a renderer-supplied cwd only when its real path is an authorized
   * root or one of that root's real subdirectories. Rejects nonexistent
   * paths, files, `..`/absolute escapes, and symlinks that resolve outside
   * every root.
   * @param {unknown} candidate - the renderer-supplied cwd.
   * @returns {string | null} the canonical real authorized cwd, or null.
   */
  function resolveAuthorizedCwd(candidate) {
    if (typeof candidate !== 'string' || candidate.trim() === '') {
      return null;
    }
    const resolved = path.resolve(candidate);
    let real;
    try {
      if (!fs.statSync(resolved).isDirectory()) return null;
      real = fs.realpathSync(resolved);
    } catch {
      return null;
    }
    for (const root of authorizedRoots()) {
      if (containedIn(root, real)) return real;
    }
    return null;
  }

  /**
   * Resolve a relative path inside an authorized cwd, refusing traversal and
   * symlink escapes: the deepest existing node on the target chain must stay
   * inside the base after realpath normalization. Symlinks that stay inside
   * the workspace (pnpm store links) keep working.
   * @param {unknown} cwd - the renderer-supplied cwd (authorized first).
   * @param {unknown} relativePath - path relative to the cwd.
   * @returns {string | null} the canonical target, or null.
   */
  function resolveInside(cwd, relativePath) {
    const base = resolveAuthorizedCwd(cwd);
    if (base === null) return null;
    const rel = typeof relativePath === 'string' ? relativePath : '';
    const target = path.resolve(base, rel);
    const fromBase = path.relative(base, target);
    if (fromBase.startsWith('..') || path.isAbsolute(fromBase)) return null;
    let node = target;
    while (true) {
      const nodeReal = realPathOrNull(node);
      if (nodeReal !== null) {
        return containedIn(base, nodeReal) ? target : null;
      }
      const parent = path.dirname(node);
      if (parent === node) return null;
      node = parent;
    }
  }

  return { authorizedRoot, authorizedRoots, resolveAuthorizedCwd, resolveInside };
}

function safeListedWorkspaces(listRegisteredWorkspaces) {
  try {
    const listed = listRegisteredWorkspaces();
    return Array.isArray(listed) ? listed : [];
  } catch {
    return [];
  }
}

function collectRoots(candidates) {
  const seen = new Set();
  const roots = [];
  for (const raw of candidates) {
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    const resolved = path.resolve(raw);
    try {
      if (!fs.statSync(resolved).isDirectory()) continue;
    } catch {
      continue;
    }
    const key = identityKey(resolved);
    if (seen.has(key)) continue;
    seen.add(key);
    roots.push(resolved);
  }
  return roots;
}

function identityKey(resolved) {
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Canonical real path of a maybe-missing node, or null when it does not
 * exist (ENOENT and friends).
 * @param {string} target - the node to resolve.
 * @returns {string | null} the realpath, or null.
 */
function realPathOrNull(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

function containedIn(root, candidate) {
  const fromRoot = path.relative(root, candidate);
  return !fromRoot.startsWith('..') && !path.isAbsolute(fromRoot);
}

function dshHome() {
  const fromEnv = process.env.DSH_HOME;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    const raw = fromEnv.trim();
    if (raw === '~') return os.homedir();
    if (raw.startsWith('~/') || raw.startsWith('~\\')) {
      return path.resolve(path.join(os.homedir(), raw.slice(2)));
    }
    return path.resolve(raw);
  }
  return path.join(os.homedir(), '.dsh');
}

/**
 * Paths persisted by `dsh-workspace` under `$DSH_HOME/storages/workspace.json`.
 * Missing, unreadable, or malformed files yield an empty list rather than
 * disabling the boot workspace.
 * @param {string} [homeDir] - harness home; defaults to `$DSH_HOME` or `~/.dsh`.
 * @returns {string[]} registered workspace paths.
 */
function readHarnessRegisteredWorkspacePaths(homeDir = dshHome()) {
  const file = path.join(homeDir, 'storages', 'workspace.json');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return [];
  }
  if (typeof document !== 'object' || document === null) return [];
  const unit = document.unit;
  if (typeof unit !== 'object' || unit === null || unit.name !== 'workspace') {
    return [];
  }
  const tables = document.tables;
  if (typeof tables !== 'object' || tables === null) return [];
  const records = tables.workspaces;
  if (typeof records !== 'object' || records === null || Array.isArray(records)) {
    return [];
  }
  const paths = [];
  for (const record of Object.values(records)) {
    if (typeof record !== 'object' || record === null) continue;
    if (typeof record.path === 'string' && record.path.trim() !== '') {
      paths.push(record.path);
    }
  }
  return paths;
}

/**
 * Lazy production authority bound to the configured boot workspace plus the
 * harness-registered workspace paths. Outside Electron (node:test) without
 * an injected authority this yields a null root, which disables the
 * capability rather than crashing the test process.
 */
function loadWorkspaceAuthority() {
  try {
    const { loadConfig } = require('./config');
    return createWorkspaceAuthority({
      workspace: loadConfig().workspace,
      listRegisteredWorkspaces: () => readHarnessRegisteredWorkspacePaths(),
    });
  } catch {
    return createWorkspaceAuthority({ workspace: '' });
  }
}

module.exports = {
  createWorkspaceAuthority,
  loadWorkspaceAuthority,
  readHarnessRegisteredWorkspacePaths,
};
