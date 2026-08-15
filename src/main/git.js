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
 * Authorize a renderer-supplied cwd against the configured workspace root.
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

async function gitStatus(cwd) {
  const root = asCwd(cwd);
  if (!root) return null;
  const inside = await runGit(root, ['rev-parse', '--is-inside-work-tree']);
  if (inside.missing || inside.code !== 0 || inside.stdout.trim() !== 'true') return null;

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
  };
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

module.exports = {
  gitStatus,
  gitDiff,
  gitCommit,
  gitPush,
  gitPull,
  gitCreateChangeRequest,
  parseUnifiedDiff,
  run,
  setWorkspaceAuthority,
  GIT_TIMEOUT_MS,
  GIT_MAX_OUTPUT_BYTES,
};
