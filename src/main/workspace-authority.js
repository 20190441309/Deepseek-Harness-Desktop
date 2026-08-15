const fs = require('node:fs');
const path = require('node:path');

/**
 * Workspace authority: the single trust root for desktop capabilities that
 * touch the filesystem (git, PTY, file browse/read). Every renderer-supplied
 * cwd must resolve inside the configured workspace — a third-party plugin
 * installed through the marketplace must not be able to drive `shell.gitPush`
 * or `shell.readFile` against arbitrary directories using the user's
 * credentials.
 * @param {{ workspace: string }} options - the configured workspace root.
 */
function createWorkspaceAuthority({ workspace }) {
  const root = typeof workspace === 'string' && workspace.trim() !== ''
    ? path.resolve(workspace)
    : null;

  /** The single authorized filesystem root (null when none is configured). */
  function authorizedRoot() {
    return root;
  }

  /**
   * Accept a renderer-supplied cwd only when it is the workspace root or one
   * of its real subdirectories. Rejects nonexistent paths, files, and
   * `..`/absolute escapes.
   * @param {unknown} candidate - the renderer-supplied cwd.
   * @returns {string | null} the canonical authorized cwd, or null.
   */
  function resolveAuthorizedCwd(candidate) {
    if (root === null || typeof candidate !== 'string' || candidate.trim() === '') {
      return null;
    }
    const resolved = path.resolve(candidate);
    const fromRoot = path.relative(root, resolved);
    if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) {
      return null;
    }
    try {
      if (!fs.statSync(resolved).isDirectory()) return null;
    } catch {
      return null;
    }
    return resolved;
  }

  /**
   * Resolve a relative path inside an authorized cwd, refusing traversal.
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
    return target;
  }

  return { authorizedRoot, resolveAuthorizedCwd, resolveInside };
}

/**
 * Lazy production authority bound to the configured workspace. Outside
 * Electron (node:test) without an injected authority this yields a null root,
 * which disables the capability rather than crashing the test process.
 */
function loadWorkspaceAuthority() {
  try {
    const { loadConfig } = require('./config');
    return createWorkspaceAuthority({ workspace: loadConfig().workspace });
  } catch {
    return createWorkspaceAuthority({ workspace: '' });
  }
}

module.exports = { createWorkspaceAuthority, loadWorkspaceAuthority };
