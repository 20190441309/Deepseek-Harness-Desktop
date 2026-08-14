const { spawn } = require('node:child_process');
const fs = require('node:fs');

function asCwd(cwd) {
  if (typeof cwd !== 'string' || cwd.trim() === '') return null;
  try {
    if (!fs.statSync(cwd).isDirectory()) return null;
  } catch {
    return null;
  }
  return cwd;
}

function run(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      resolve({ code: -1, stdout, stderr: error.message, missing: error.code === 'ENOENT' });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr, missing: false });
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
  if (add.code !== 0) return fail(add.stderr.trim() || 'git add failed.');
  const commit = await runGit(root, ['commit', '-m', message.trim()]);
  if (commit.code !== 0) return fail(commit.stderr.trim() || commit.stdout.trim() || 'git commit failed.');
  return ok();
}

async function gitPush(cwd) {
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  const pushed = await runGit(root, ['push', '-u', 'origin', 'HEAD']);
  if (pushed.missing) return fail('Git is unavailable.');
  if (pushed.code !== 0) return fail(pushed.stderr.trim() || pushed.stdout.trim() || 'git push failed.');
  return ok();
}

async function gitPull(cwd) {
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  const pulled = await runGit(root, ['pull']);
  if (pulled.missing) return fail('Git is unavailable.');
  if (pulled.code !== 0) return fail(pulled.stderr.trim() || pulled.stdout.trim() || 'git pull failed.');
  return ok();
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
  gitCommit,
  gitPush,
  gitPull,
  gitCreateChangeRequest,
};
