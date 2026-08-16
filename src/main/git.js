const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { loadWorkspaceAuthority } = require('./workspace-authority');

let workspaceAuthority = null;

/** Test seam: pin the trust root (node:test runs outside Electron). */
function setWorkspaceAuthority(authority) {
  workspaceAuthority = authority;
}

/**
 * Authorize a renderer-supplied cwd against the boot workspace and every
 * harness-registered workspace root.
 * @param {unknown} cwd
 * @returns {string | null}
 */
function resolveAuthorizedCwd(cwd) {
  if (workspaceAuthority === null) workspaceAuthority = loadWorkspaceAuthority();
  return workspaceAuthority.resolveAuthorizedCwd(cwd);
}

function asCwd(cwd) {
  return resolveAuthorizedCwd(cwd);
}

/** Wall-clock limit for one git/gh child. */
const GIT_TIMEOUT_MS = 60_000;
/** Retained stdout cap; overflow kills the child and sets truncated. */
const GIT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

function run(command, args, cwd, limits = {}) {
  const timeoutMs = limits.timeoutMs ?? GIT_TIMEOUT_MS;
  const maxBytes = limits.maxBytes ?? GIT_MAX_OUTPUT_BYTES;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: command === 'git'
        ? { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(cwd) }
        : process.env,
    });
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let truncated = false;
    const timer = setTimeout(() => {
      child.kill();
      finish({
        code: -1,
        stdout,
        stderr: 'git command timed out',
        missing: false,
        timedOut: true,
        truncated,
      });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      const next = stdoutBytes + chunk.length;
      if (next > maxBytes) {
        const remain = Math.max(0, maxBytes - stdoutBytes);
        stdout += chunk.subarray(0, remain).toString();
        stdoutBytes = maxBytes;
        truncated = true;
        child.kill();
        return;
      }
      stdoutBytes = next;
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      finish({
        code: -1,
        stdout,
        stderr: error.message,
        missing: error.code === 'ENOENT',
        timedOut: false,
        truncated,
      });
    });
    child.on('close', (code) => {
      finish({
        code: code ?? 1,
        stdout,
        stderr,
        missing: false,
        timedOut: false,
        truncated,
      });
    });
  });
}

function runGit(cwd, args) {
  return run('git', args, cwd);
}

function fail(message) {
  return { ok: false, message };
}

function ok(extra = {}) {
  return { ok: true, ...extra };
}

function parseAheadBehind(detail) {
  let aheadCount = 0;
  let behindCount = 0;
  if (!detail) return { aheadCount, behindCount };
  const ahead = detail.match(/ahead (\d+)/);
  const behind = detail.match(/behind (\d+)/);
  if (ahead) aheadCount = Number(ahead[1]);
  if (behind) behindCount = Number(behind[1]);
  return { aheadCount, behindCount };
}

function parseStatusHeader(header) {
  if (header.startsWith('## HEAD (no branch)')) {
    return { refName: null, hasUpstream: false, aheadCount: 0, behindCount: 0 };
  }
  const match = header.match(/^## (?:No commits yet on )?(\S+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/);
  if (!match) {
    return { refName: null, hasUpstream: false, aheadCount: 0, behindCount: 0 };
  }
  const counts = parseAheadBehind(match[3]);
  return {
    refName: match[1],
    hasUpstream: Boolean(match[2]),
    aheadCount: counts.aheadCount,
    behindCount: counts.behindCount,
  };
}

function providerFromRemoteUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  if (lower.includes('github.com')) {
    return { kind: 'github', name: 'GitHub', baseUrl: 'https://github.com' };
  }
  if (lower.includes('gitlab.com') || lower.includes('gitlab.')) {
    return { kind: 'gitlab', name: 'GitLab', baseUrl: 'https://gitlab.com' };
  }
  if (lower.includes('bitbucket.org')) {
    return { kind: 'bitbucket', name: 'Bitbucket', baseUrl: 'https://bitbucket.org' };
  }
  if (lower.includes('dev.azure.com') || lower.includes('visualstudio.com')) {
    return { kind: 'azure-devops', name: 'Azure DevOps', baseUrl: 'https://dev.azure.com' };
  }
  return { kind: 'unknown', name: 'source control', baseUrl: '' };
}

async function defaultRefName(cwd, hasPrimaryRemote) {
  if (hasPrimaryRemote) {
    const symbolic = await runGit(cwd, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
    if (symbolic.code === 0) {
      const name = symbolic.stdout.trim().replace(/^refs\/remotes\/origin\//, '');
      if (name) return name;
    }
  }
  for (const candidate of ['main', 'master']) {
    const probe = await runGit(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${candidate}`]);
    if (probe.code === 0) return candidate;
  }
  return null;
}

async function countAheadOfDefault(cwd, defaultRef, hasPrimaryRemote) {
  if (!defaultRef) return undefined;
  const spec = hasPrimaryRemote ? `origin/${defaultRef}..HEAD` : `${defaultRef}..HEAD`;
  const listed = await runGit(cwd, ['rev-list', '--count', spec]);
  if (listed.code !== 0) return undefined;
  const count = Number(listed.stdout.trim());
  return Number.isFinite(count) ? count : undefined;
}

async function readPullRequest(cwd) {
  const viewed = await run('gh', ['pr', 'view', '--json', 'number,title,url,baseRefName,headRefName,state'], cwd);
  if (viewed.missing || viewed.code !== 0) return null;
  try {
    const parsed = JSON.parse(viewed.stdout);
    if (!parsed || typeof parsed.number !== 'number') return null;
    const state = String(parsed.state || '').toLowerCase();
    return {
      number: parsed.number,
      title: parsed.title || '',
      url: parsed.url || '',
      baseRef: parsed.baseRefName || '',
      headRef: parsed.headRefName || '',
      state: state === 'merged' || state === 'closed' ? state : 'open',
    };
  } catch {
    return null;
  }
}

function notARepoStatus() {
  return {
    isRepo: false,
    refName: null,
    hasWorkingTreeChanges: false,
    hasUpstream: false,
    aheadCount: 0,
    behindCount: 0,
    aheadOfDefaultCount: 0,
    pr: null,
    isDefaultRef: false,
    hasPrimaryRemote: false,
  };
}

async function gitStatus(cwd) {
  const root = asCwd(cwd);
  if (!root) return null;
  const inside = await runGit(root, ['rev-parse', '--is-inside-work-tree']);
  if (inside.missing || inside.code !== 0 || inside.stdout.trim() !== 'true') {
    return notARepoStatus();
  }

  const short = await runGit(root, ['status', '-sb']);
  if (short.code !== 0) return null;
  const lines = short.stdout.replace(/\r\n/g, '\n').split('\n').filter((line) => line.length > 0);
  const header = parseStatusHeader(lines[0] || '## HEAD (no branch)');
  const remotes = await runGit(root, ['remote']);
  const hasPrimaryRemote = remotes.code === 0 && remotes.stdout.split(/\r?\n/).includes('origin');
  const defaultRef = await defaultRefName(root, hasPrimaryRemote);
  const aheadOfDefaultCount = await countAheadOfDefault(root, defaultRef, hasPrimaryRemote);
  const remoteUrl = hasPrimaryRemote
    ? await runGit(root, ['remote', 'get-url', 'origin'])
    : { code: 1, stdout: '' };
  const sourceControlProvider = remoteUrl.code === 0 ? providerFromRemoteUrl(remoteUrl.stdout) : undefined;
  const pr = await readPullRequest(root);

  return {
    refName: header.refName,
    hasWorkingTreeChanges: lines.length > 1,
    hasUpstream: header.hasUpstream,
    aheadCount: header.aheadCount,
    behindCount: header.behindCount,
    ...(aheadOfDefaultCount !== undefined ? { aheadOfDefaultCount } : {}),
    pr,
    ...(sourceControlProvider ? { sourceControlProvider } : {}),
    isDefaultRef: header.refName !== null && header.refName === defaultRef,
    hasPrimaryRemote,
    isRepo: true,
  };
}

/**
 * Initialize a git work tree at an authorized cwd that is not already one.
 * @param {unknown} cwd
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
async function gitInit(cwd) {
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  const inside = await runGit(root, ['rev-parse', '--is-inside-work-tree']);
  if (inside.code === 0 && inside.stdout.trim() === 'true') return ok();
  const inited = await runGit(root, ['init', '-b', 'main']);
  if (inited.missing) return fail('Git is unavailable.');
  if (inited.timedOut) return fail('Git command timed out.');
  if (inited.code !== 0) return fail(inited.stderr.trim() || 'git init failed.');
  return ok();
}

async function gitCommit(cwd, message) {
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  if (typeof message !== 'string' || message.trim() === '') {
    return fail('Commit message is required.');
  }
  const add = await runGit(root, ['add', '-A']);
  if (add.missing) return fail('Git is unavailable.');
  if (add.timedOut) return fail('Git command timed out.');
  if (add.code !== 0) return fail(add.stderr.trim() || 'git add failed.');
  const commit = await runGit(root, ['commit', '-m', message.trim()]);
  if (commit.timedOut) return fail('Git command timed out.');
  if (commit.code !== 0) return fail(commit.stderr.trim() || commit.stdout.trim() || 'git commit failed.');
  return ok();
}

async function gitPush(cwd) {
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  const pushed = await runGit(root, ['push', '-u', 'origin', 'HEAD']);
  if (pushed.missing) return fail('Git is unavailable.');
  if (pushed.timedOut) return fail('Git command timed out.');
  if (pushed.code !== 0) return fail(pushed.stderr.trim() || pushed.stdout.trim() || 'git push failed.');
  return ok();
}

async function gitPull(cwd) {
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  const pulled = await runGit(root, ['pull']);
  if (pulled.missing) return fail('Git is unavailable.');
  if (pulled.timedOut) return fail('Git command timed out.');
  if (pulled.code !== 0) return fail(pulled.stderr.trim() || pulled.stdout.trim() || 'git pull failed.');
  return ok();
}

const MAX_UNTRACKED_BYTES = 256 * 1024;

function unquoteGitPath(spec) {
  const trimmed = String(spec || '').split('\t')[0].trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return trimmed;
}

function stripAbPrefix(spec) {
  if (spec.startsWith('a/') || spec.startsWith('b/')) return spec.slice(2);
  return spec;
}

function parseDiffGitArgs(rest) {
  const tokens = [];
  let i = 0;
  while (i < rest.length) {
    while (rest[i] === ' ') i += 1;
    if (i >= rest.length) break;
    if (rest[i] === '"') {
      let j = i + 1;
      let out = '';
      while (j < rest.length) {
        if (rest[j] === '\\' && j + 1 < rest.length) {
          out += rest[j + 1];
          j += 2;
          continue;
        }
        if (rest[j] === '"') {
          j += 1;
          break;
        }
        out += rest[j];
        j += 1;
      }
      tokens.push(out);
      i = j;
      continue;
    }
    const space = rest.indexOf(' ', i);
    if (space < 0) {
      tokens.push(rest.slice(i));
      break;
    }
    tokens.push(rest.slice(i, space));
    i = space;
  }
  return tokens;
}

function pathFromDiffGit(line) {
  const tokens = parseDiffGitArgs(line.slice('diff --git '.length));
  const dst = tokens[1] || tokens[0] || '';
  return stripAbPrefix(dst);
}

function pathFromPlusMinus(spec) {
  const cleaned = unquoteGitPath(spec);
  if (cleaned === '' || cleaned === '/dev/null') return null;
  return stripAbPrefix(cleaned);
}

function parseUnifiedDiff(text) {
  const files = [];
  let current = null;
  let hunk = null;
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current) files.push(current);
      current = { path: pathFromDiffGit(line), status: 'modified', hunks: [] };
      hunk = null;
      continue;
    }
    if (!current) continue;
    if (line.startsWith('new file mode')) {
      current.status = 'added';
      continue;
    }
    if (line.startsWith('deleted file mode')) {
      current.status = 'deleted';
      continue;
    }
    if (line.startsWith('rename from ')) {
      current.status = 'renamed';
      current.oldPath = line.slice('rename from '.length);
      continue;
    }
    if (hunk === null && line.startsWith('+++ ')) {
      const next = pathFromPlusMinus(line.slice(4));
      if (next !== null) current.path = next;
      continue;
    }
    if (hunk === null && line.startsWith('--- ')) {
      const next = pathFromPlusMinus(line.slice(4));
      if (next !== null && !current.path) current.path = next;
      continue;
    }
    if (line.startsWith('@@')) {
      hunk = { header: line, lines: [] };
      current.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith('+')) hunk.lines.push({ kind: 'add', text: line.slice(1) });
    else if (line.startsWith('-')) hunk.lines.push({ kind: 'del', text: line.slice(1) });
    else if (line.startsWith(' ')) hunk.lines.push({ kind: 'context', text: line.slice(1) });
  }
  if (current) files.push(current);
  return files;
}

function untrackedAsDiff(root, rel) {
  const target = path.join(root, rel);
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  if (stat.size > MAX_UNTRACKED_BYTES) {
    return { path: rel, status: 'added', hunks: [] };
  }
  const buf = fs.readFileSync(target);
  if (buf.includes(0)) {
    return { path: rel, status: 'added', hunks: [] };
  }
  const body = buf.toString('utf8').replace(/\r\n/g, '\n');
  const rows = body.split('\n');
  if (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
  return {
    path: rel,
    status: 'added',
    hunks: [{
      header: `@@ -0,0 +1,${rows.length} @@`,
      lines: rows.map((text) => ({ kind: 'add', text })),
    }],
  };
}

async function gitDiff(cwd) {
  const root = asCwd(cwd);
  if (!root) return null;
  const inside = await runGit(root, ['rev-parse', '--is-inside-work-tree']);
  if (inside.missing || inside.code !== 0 || inside.stdout.trim() !== 'true') return null;

  const files = [];
  let truncated = false;
  const head = await runGit(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  if (head.code === 0) {
    const diff = await runGit(root, ['diff', 'HEAD', '--no-color', '--no-ext-diff', '--find-renames']);
    truncated = Boolean(diff.truncated);
    files.push(...parseUnifiedDiff(diff.stdout));
  } else {
    const staged = await runGit(root, ['diff', '--cached', '--no-color', '--no-ext-diff']);
    const unstaged = await runGit(root, ['diff', '--no-color', '--no-ext-diff']);
    truncated = Boolean(staged.truncated || unstaged.truncated);
    files.push(...parseUnifiedDiff(staged.stdout), ...parseUnifiedDiff(unstaged.stdout));
  }

  const untracked = await runGit(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  if (untracked.code === 0 && untracked.stdout) {
    for (const rel of untracked.stdout.split('\0').filter(Boolean)) {
      if (files.some((file) => file.path === rel)) continue;
      const added = untrackedAsDiff(root, rel);
      if (added) files.push(added);
    }
  }
  return truncated ? { files, truncated: true } : { files };
}

async function gitCreateChangeRequest(cwd, input) {
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const body = typeof input?.body === 'string' ? input.body : '';
  if (!title) return fail('Change request title is required.');
  const created = await run('gh', ['pr', 'create', '--title', title, '--body', body], root);
  if (created.missing) return fail('gh is unavailable.');
  if (created.code !== 0) return fail(created.stderr.trim() || created.stdout.trim() || 'gh pr create failed.');
  const url = created.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  return ok(url ? { url } : {});
}

/**
 * Parse `git status --porcelain=v1 -z`. Rename/copy origin fields are skipped.
 * @param {string} stdout
 * @returns {{ path: string, xy: string }[]}
 */
function parsePorcelainZ(stdout) {
  const entries = [];
  const parts = String(stdout || '').split('\0');
  let i = 0;
  while (i < parts.length) {
    const rec = parts[i];
    i += 1;
    if (!rec || rec.length < 3) continue;
    const xy = rec.slice(0, 2);
    let filePath = rec.slice(3);
    if (xy.includes('R') || xy.includes('C')) {
      const dest = parts[i] || filePath;
      i += 1;
      filePath = dest;
    }
    entries.push({ path: filePath, xy });
  }
  return entries;
}

function resolveGitPath(cwd, relativePath) {
  const root = asCwd(cwd);
  if (!root) return { root: null, rel: null };
  if (workspaceAuthority === null) workspaceAuthority = loadWorkspaceAuthority();
  const target = workspaceAuthority.resolveInside(cwd, relativePath);
  if (!target) return { root, rel: null };
  const rel = path.relative(root, target).replaceAll('\\', '/');
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return { root, rel: null };
  return { root, rel };
}

async function gitPathOp(cwd, relativePath, args, failVerb) {
  const { root, rel } = resolveGitPath(cwd, relativePath);
  if (!root) return fail('Git status is unavailable.');
  if (!rel) return fail('Path is outside the workspace.');
  const result = await runGit(root, [...args, '--', rel]);
  if (result.missing) return fail('Git is unavailable.');
  if (result.timedOut) return fail('Git command timed out.');
  if (result.code !== 0) return fail(result.stderr.trim() || result.stdout.trim() || failVerb);
  return ok();
}

async function gitStage(cwd, relativePath) {
  return gitPathOp(cwd, relativePath, ['add'], 'git add failed.');
}

async function gitUnstage(cwd, relativePath) {
  return gitPathOp(cwd, relativePath, ['reset', '-q'], 'git reset failed.');
}

async function gitDiscard(cwd, relativePath) {
  return gitPathOp(cwd, relativePath, ['checkout'], 'git checkout failed.');
}

async function gitStatusEntries(cwd) {
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  const listed = await runGit(root, ['status', '--porcelain=v1', '-z']);
  if (listed.missing) return fail('Git is unavailable.');
  if (listed.timedOut) return fail('Git command timed out.');
  if (listed.code !== 0) return fail(listed.stderr.trim() || 'git status failed.');
  return ok({ entries: parsePorcelainZ(listed.stdout) });
}

/** Ref names git accepts on the command line; blocks option-like and traversal-ish values. */
const REF_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function safeRefName(ref) {
  const name = String(ref || '').trim();
  if (!name || !REF_NAME_PATTERN.test(name)) return null;
  if (name.includes('..') || name.endsWith('.lock') || name.endsWith('/')) return null;
  return name;
}

async function gitBranchList(cwd) {
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  const listed = await runGit(root, [
    'for-each-ref',
    '--format=%(refname:short)%09%(HEAD)%09%(refname)',
    'refs/heads',
    'refs/remotes',
  ]);
  if (listed.missing) return fail('Git is unavailable.');
  if (listed.timedOut) return fail('Git command timed out.');
  if (listed.code !== 0) return fail(listed.stderr.trim() || 'git branch list failed.');
  const branches = [];
  for (const line of listed.stdout.split('\n')) {
    const [short, headMark, full] = line.split('\t');
    if (!short || !full) continue;
    const isRemote = full.startsWith('refs/remotes/');
    if (isRemote && full.endsWith('/HEAD')) continue;
    branches.push({
      name: short,
      isRemote,
      isCurrent: headMark === '*',
      remoteName: isRemote ? short.split('/')[0] : undefined,
    });
  }
  const sym = await runGit(root, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD']);
  const defaultRef = sym.code === 0 ? sym.stdout.trim() : null;
  if (defaultRef) {
    const target = branches.find(item => item.name === defaultRef);
    if (target) target.isDefault = true;
  }
  return ok({ branches, defaultRef });
}

async function gitSwitchBranch(cwd, ref) {
  const root = asCwd(cwd);
  const name = safeRefName(ref);
  if (!root) return fail('Git status is unavailable.');
  if (!name) return fail('Invalid branch name.');
  const result = await runGit(root, ['checkout', name]);
  if (result.missing) return fail('Git is unavailable.');
  if (result.timedOut) return fail('Git command timed out.');
  if (result.code !== 0) return fail(result.stderr.trim() || result.stdout.trim() || 'git checkout failed.');
  const head = await runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return ok({ refName: head.code === 0 ? head.stdout.trim() : name });
}

async function gitCreateBranch(cwd, name) {
  const root = asCwd(cwd);
  const branch = safeRefName(name);
  if (!root) return fail('Git status is unavailable.');
  if (!branch) return fail('Invalid branch name.');
  const result = await runGit(root, ['checkout', '-b', branch]);
  if (result.missing) return fail('Git is unavailable.');
  if (result.timedOut) return fail('Git command timed out.');
  if (result.code !== 0) return fail(result.stderr.trim() || result.stdout.trim() || 'git checkout -b failed.');
  return ok({ refName: branch });
}

module.exports = {
  gitStatus,
  gitInit,
  gitDiff,
  gitCommit,
  gitPush,
  gitPull,
  gitCreateChangeRequest,
  gitStage,
  gitUnstage,
  gitDiscard,
  gitStatusEntries,
  gitBranchList,
  gitSwitchBranch,
  gitCreateBranch,
  parsePorcelainZ,
  parseUnifiedDiff,
  run,
  setWorkspaceAuthority,
  GIT_TIMEOUT_MS,
  GIT_MAX_OUTPUT_BYTES,
};
