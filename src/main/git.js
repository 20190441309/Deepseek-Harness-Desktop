const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generateCommitMessage, generatePrContent } = require('./git-generate');
const { createTrace2Monitor } = require('./git-trace2');
const {
  asCwd,
  fail,
  ok,
  run,
  runGit,
  gitFailureMessage,
  withTruncationMarker,
  inferHookName,
  resolveInsideWorkspace,
  safeRefName,
  COMMIT_TIMEOUT_MS,
  PREPARED_COMMIT_PATCH_MAX_OUTPUT_BYTES,
  RANGE_DIFF_PATCH_MAX_OUTPUT_BYTES,
  setWorkspaceAuthority,
  gitChildEnv,
  sanitizeProgressText,
  isGitAdviceLine,
  parseStatusHeader,
  GIT_TIMEOUT_MS,
  FETCH_TIMEOUT_MS,
  GH_TIMEOUT_MS,
  GIT_MAX_OUTPUT_BYTES,
} = require('./git-exec');
const {
  normalizeGitRemoteUrl,
  parseGitHubRepositoryNameWithOwner,
  providerFromRemoteUrl,
  listRemoteNames,
  resolvePrimaryRemoteName,
  selectProviderContext,
  changeRequestTerms,
  defaultRefName,
  resolveBaseBranchForNoUpstream,
  computeAheadCountAgainstBase,
  resolveCurrentUpstream,
  resolvePushRemoteName,
  resolvePublishBranchName,
} = require('./git-remotes');
const {
  lookupOpenPullRequest,
  readPullRequest,
  resolveBranchHeadContext,
  rememberLastKnownPr,
  resolveLastKnownPr,
  matchesBranchHeadContext,
  parseGhPullRequestRow,
  setLookupOpenPullRequest,
  resetLastKnownPrCache,
} = require('./git-pullrequest');
const { fetchForStatus, resetFetchCooldowns } = require('./git-fetch');
const { MAX_UNTRACKED_BYTES, parseUnifiedDiff, gitDiff } = require('./git-diff');
const { readPrTemplate, resolvePrBaseBranch, setGhDefaultBranchResolver } = require('./git-templates');

function notARepoStatus() {
  return {
    isRepo: false,
    refName: null,
    hasWorkingTreeChanges: false,
    hasUpstream: false,
    aheadCount: 0,
    behindCount: 0,
    aheadOfDefaultCount: 0,
    aheadUnreliable: false,
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
  const remoteNames = remotes.code === 0
    ? remotes.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    : [];
  const hasPrimaryRemote = remoteNames.includes('origin');
  const defaultRef = await defaultRefName(root, hasPrimaryRemote);
  const isDefaultRef = header.refName !== null && header.refName === defaultRef;
  // No-upstream ahead is vs the default/base ref, not porcelain 0.
  const vsDefault = header.refName && (!isDefaultRef || !header.hasUpstream)
    ? await computeAheadCountAgainstBase(root, header.refName)
    : { count: 0, unreliable: false };
  let aheadCount = header.aheadCount;
  let behindCount = header.behindCount;
  if (!header.hasUpstream && header.refName) {
    aheadCount = vsDefault.count;
    behindCount = 0;
  }
  const selected = await selectProviderContext(root);
  const sourceControlProvider = selected?.provider;

  return {
    refName: header.refName,
    hasWorkingTreeChanges: lines.length > 1,
    hasUpstream: header.hasUpstream,
    aheadCount,
    behindCount,
    aheadOfDefaultCount: isDefaultRef ? 0 : vsDefault.count,
    aheadUnreliable: vsDefault.unreliable,
    pr: null,
    ...(sourceControlProvider ? { sourceControlProvider } : {}),
    isDefaultRef,
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

/**
 * Build a commit subject from changed paths when staged context is absent.
 * @param {{ path: string }[]} files
 * @returns {string}
 */
function summarizeCommitMessage(files) {
  if (!Array.isArray(files) || files.length === 0) return 'Update project files';
  const first = files[0].path;
  if (files.length === 1) return `Update ${first}`;
  return `Update ${first} and ${files.length - 1} other files`;
}

function sanitizeFeatureBranchName(raw) {
  const normalized = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/^[./\s_-]+|[./\s_-]+$/g, '');
  const fragment = normalized
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/-+/g, '-')
    .replace(/^[./_-]+|[./_-]+$/g, '')
    .slice(0, 64)
    .replace(/[./_-]+$/g, '');
  const sanitized = fragment.length > 0 ? fragment : 'update';
  if (sanitized.includes('/')) {
    return sanitized.startsWith('feature/') ? sanitized : `feature/${sanitized}`;
  }
  return `feature/${sanitized}`;
}

function uniqueFeatureBranchName(existingNames, preferred) {
  const resolvedBase = sanitizeFeatureBranchName(preferred || 'update');
  const taken = new Set((existingNames || []).map((name) => String(name).toLowerCase()));
  if (!taken.has(resolvedBase)) return resolvedBase;
  let suffix = 2;
  while (taken.has(`${resolvedBase}-${suffix}`)) suffix += 1;
  return `${resolvedBase}-${suffix}`;
}

async function prepareCommitContext(root, filePaths) {
  const selected = Array.isArray(filePaths)
    ? filePaths.map((item) => String(item || '')).filter(Boolean)
    : [];
  if (selected.length > 0) {
    const rels = [];
    for (const item of selected) {
      const { rel } = resolveGitPath(root, item);
      if (!rel) return { error: 'Path is outside the workspace.' };
      rels.push(rel);
    }
    await runGit(root, ['reset']);
    const add = await runGit(root, ['--literal-pathspecs', 'add', '-A', '--', ...rels]);
    if (add.missing) return { error: 'Git is unavailable.' };
    if (add.timedOut) return { error: 'Git command timed out.' };
    if (add.code !== 0) return { error: gitFailureMessage(add, 'git add failed.') };
  } else {
    const add = await runGit(root, ['add', '-A']);
    if (add.missing) return { error: 'Git is unavailable.' };
    if (add.timedOut) return { error: 'Git command timed out.' };
    if (add.code !== 0) return { error: gitFailureMessage(add, 'git add failed.') };
  }
  const stagedSummary = await runGit(root, ['diff', '--cached', '--name-status']);
  if (stagedSummary.timedOut) return { error: 'Git command timed out.' };
  const summary = stagedSummary.stdout.trim();
  if (!summary) return { skipped: true };
  const stagedPatch = await runGit(root, ['diff', '--no-ext-diff', '--cached', '--patch', '--minimal'], {
    maxBytes: PREPARED_COMMIT_PATCH_MAX_OUTPUT_BYTES,
  });
  return {
    stagedSummary: summary,
    stagedPatch: withTruncationMarker(stagedPatch.stdout, stagedPatch.truncated),
  };
}

async function runGitWithProgress(cwd, args, emit, limits = {}) {
  const monitor = createTrace2Monitor((event) => {
    if (event.kind === 'started') {
      emit({ kind: 'hook', hookName: event.hookName, title: `Running ${event.hookName}...` });
    }
    if (event.kind === 'finished') {
      emit({
        kind: 'hook_finished',
        hookName: event.hookName,
        title: `Finished ${event.hookName}`,
        text: event.exitCode === 0 || event.exitCode == null
          ? `${event.hookName} finished`
          : `${event.hookName} exited ${event.exitCode}`,
      });
    }
  });
  try {
    const result = await runGit(cwd, args, {
      ...limits,
      env: { ...monitor.env, ...(limits.env || {}) },
      onLine: (line) => {
        monitor.poll();
        const hook = inferHookName(line);
        if (hook) emit({ kind: 'hook', hookName: hook, title: `Running ${hook}...`, text: line });
        else emit({ kind: 'line', text: line });
      },
    });
    monitor.flush();
    return result;
  } finally {
    monitor.close();
  }
}

async function readHeadSha(cwd) {
  const head = await runGit(cwd, ['rev-parse', 'HEAD']);
  return head.code === 0 ? head.stdout.trim() : '';
}

/**
 * First line is the subject; remaining lines are the body.
 * @param {unknown} raw
 * @returns {{ subject: string, body: string } | null}
 */
function parseCustomCommitMessage(raw) {
  const normalized = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return null;
  const [firstLine, ...rest] = normalized.split('\n');
  const subject = (firstLine || '').trim();
  if (!subject) return null;
  return { subject, body: rest.join('\n').trim() };
}

/** `git commit -m subject` plus optional `-m body`. */
function commitArgs(message) {
  const parsed = parseCustomCommitMessage(message);
  if (!parsed) return ['commit', '-m', 'Update'];
  if (!parsed.body) return ['commit', '-m', parsed.subject];
  return ['commit', '-m', parsed.subject, '-m', parsed.body];
}

async function gitCommit(cwd, message, filePaths, onProgress, options = {}) {
  const emit = typeof onProgress === 'function' ? onProgress : () => {};
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  const prepared = await prepareCommitContext(root, filePaths);
  if (prepared.error) return fail(prepared.error);
  if (prepared.skipped) {
    if (options.featureBranch) {
      return fail('Cannot create a feature branch because there are no changes to commit.');
    }
    return ok({ skipped: true, status: 'skipped' });
  }

  const custom = parseCustomCommitMessage(message);
  const hasCustom = custom !== null;
  // Keep custom messages verbatim; sanitize only model/heuristic output.
  let suggestion = hasCustom
    ? {
      subject: custom.subject,
      body: custom.body,
      ...(options.featureBranch ? { branch: sanitizeFeatureBranchName(custom.subject) } : {}),
    }
    : null;

  const resolveGenerated = async () => {
    const recent = await runGit(root, ['log', '-n', '8', '--pretty=%s']);
    return generateCommitMessage({
      stagedSummary: prepared.stagedSummary,
      stagedPatch: prepared.stagedPatch,
      includeBranch: Boolean(options.featureBranch),
      recentSubjects: recent.code === 0 ? recent.stdout.trim() : '',
    });
  };

  if (options.featureBranch) {
    emit({ kind: 'phase', title: 'Preparing feature ref...' });
    if (!hasCustom) {
      suggestion = await resolveGenerated();
      if (suggestion.error) return fail(suggestion.error);
    }
    const listed = await gitBranchList(root);
    if (!listed.ok) return fail(listed.message || 'git branch list failed.');
    const nextRef = uniqueFeatureBranchName(
      (listed.branches || []).map((ref) => ref.name),
      suggestion.branch || suggestion.subject,
    );
    const created = await gitCreateBranch(root, nextRef);
    if (!created.ok) return fail(created.message || 'git checkout -b failed.');
  } else if (!hasCustom) {
    emit({ kind: 'phase', title: 'Generating commit message...' });
    suggestion = await resolveGenerated();
    if (suggestion.error) return fail(suggestion.error);
  }

  emit({ kind: 'phase', title: 'Committing...' });
  const text = suggestion.body
    ? `${suggestion.subject}\n\n${suggestion.body}`
    : suggestion.subject;
  const commit = await runGitWithProgress(root, commitArgs(text), emit, {
    timeoutMs: COMMIT_TIMEOUT_MS,
  });
  if (commit.timedOut) return fail('Git command timed out.');
  if (commit.code !== 0) return fail(gitFailureMessage(commit, 'git commit failed.'));
  const commitSha = await readHeadSha(root);
  return ok({
    status: 'created',
    commitSha,
    subject: suggestion.subject,
    body: suggestion.body,
    suggestedBranch: sanitizeFeatureBranchName(suggestion.branch || suggestion.subject),
  });
}

/**
 * Refresh remotes then return local porcelain status. Titlebar polls stay on `gitStatus`.
 * @param {unknown} cwd
 * @returns {Promise<object | null>}
 */
async function gitFetchForStatus(cwd) {
  const root = asCwd(cwd);
  if (!root) return null;
  await fetchForStatus(root);
  return gitStatus(root);
}

/**
 * Look up the open GitHub PR for HEAD. Kept off the status poll so focus refresh stays local.
 * Transient `gh` failures keep the last successful badge for this branch.
 * @param {unknown} cwd
 * @returns {Promise<{ ok: boolean, pr?: object | null, message?: string }>}
 */
async function gitReadPullRequest(cwd) {
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  const header = await runGit(root, ['status', '-sb']);
  const parsedHeader = parseStatusHeader((header.stdout || '').split(/\r?\n/)[0] || '## HEAD (no branch)');
  if (!parsedHeader.refName) return ok({ pr: null });
  const branchKey = `${root}\u0000${parsedHeader.refName}`;
  const looked = await lookupOpenPullRequest(root);
  const headContext = looked.headContext || await resolveBranchHeadContext(root, parsedHeader.refName);
  const current = {
    upstreamRef: headContext.upstreamRef,
    headBranch: headContext.headBranch,
    remoteName: headContext.remoteName,
    headRemoteUrlKey: headContext.headRemoteUrlKey,
  };
  if (looked.failed) {
    return ok({ pr: resolveLastKnownPr(branchKey, current) });
  }
  rememberLastKnownPr(branchKey, { pr: looked.pr, ...current });
  return ok({ pr: looked.pr });
}

async function gitPush(cwd, onProgress) {
  const emit = typeof onProgress === 'function' ? onProgress : () => {};
  emit({ kind: 'phase', title: 'Pushing...' });
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  await fetchForStatus(root);
  const status = await gitStatus(cwd);
  if (!status?.refName) return fail('Cannot push from detached HEAD.');
  const hasNoLocalDelta = status.aheadCount === 0 && status.behindCount === 0;
  if (hasNoLocalDelta && !status.aheadUnreliable) {
    if (status.hasUpstream) {
      return ok({ skipped: true, status: 'skipped', branch: status.refName });
    }
    // No-upstream skip uses resolveBaseBranchForNoUpstream (gh-merge-base included).
    const comparableBase = await resolveBaseBranchForNoUpstream(root, status.refName);
    if (comparableBase) {
      const remote = await resolvePushRemoteName(root, status.refName);
      if (!remote) {
        return ok({ skipped: true, status: 'skipped', branch: status.refName });
      }
      const remoteRef = await runGit(root, [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/remotes/${remote}/${status.refName}`,
      ]);
      if (remoteRef.code === 0) {
        return ok({ skipped: true, status: 'skipped', branch: status.refName });
      }
    }
  }
  const limits = { timeoutMs: COMMIT_TIMEOUT_MS };
  let pushed;
  let upstreamBranch = null;
  if (status.hasUpstream) {
    const upstream = await resolveCurrentUpstream(root);
    upstreamBranch = upstream?.upstreamRef || null;
    pushed = upstream
      ? await runGitWithProgress(root, ['push', upstream.remoteName, `HEAD:refs/heads/${upstream.branchName}`], emit, limits)
      : await runGitWithProgress(root, ['push'], emit, limits);
  } else {
    const remote = await resolvePushRemoteName(root, status.refName);
    if (!remote) return fail('Cannot push because no git remote is configured for this repository.');
    const publishBranch = await resolvePublishBranchName(root, status.refName);
    upstreamBranch = `${remote}/${publishBranch}`;
    pushed = await runGitWithProgress(root, ['push', '-u', remote, `HEAD:refs/heads/${publishBranch}`], emit, limits);
  }
  if (pushed.missing) return fail('Git is unavailable.');
  if (pushed.timedOut) return fail('Git command timed out.');
  if (pushed.code !== 0) return fail(gitFailureMessage(pushed, 'git push failed.'));
  return ok({
    status: 'pushed',
    branch: status.refName,
    upstreamBranch,
    commitSha: await readHeadSha(root),
  });
}

async function gitPull(cwd, onProgress) {
  const emit = typeof onProgress === 'function' ? onProgress : () => {};
  emit({ kind: 'phase', title: 'Pulling...' });
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  await fetchForStatus(root);
  const status = await gitStatus(cwd);
  if (!status?.refName) return fail('Cannot pull from detached HEAD.');
  if (!status.hasUpstream) {
    return fail('Current branch has no upstream configured. Push with upstream first.');
  }
  const beforeSha = await readHeadSha(root);
  const pulled = await runGitWithProgress(root, ['pull', '--ff-only'], emit, {
    timeoutMs: COMMIT_TIMEOUT_MS,
  });
  if (pulled.missing) return fail('Git is unavailable.');
  if (pulled.timedOut) return fail('Git command timed out.');
  if (pulled.code !== 0) return fail(gitFailureMessage(pulled, 'git pull failed.'));
  const afterSha = await readHeadSha(root);
  const upstream = await resolveCurrentUpstream(root);
  const pullStatus = beforeSha && beforeSha === afterSha ? 'up_to_date' : 'pulled';
  return ok({
    status: pullStatus,
    refName: status.refName,
    upstreamRef: upstream?.upstreamRef || null,
  });
}

/**
 * Preferred `--head` for `gh pr create` (fork → `owner:branch`).
 * @param {string} cwd
 * @param {string} refName
 * @returns {Promise<string>}
 */
async function resolvePreferredHeadSelector(cwd, refName) {
  const ctx = await resolveBranchHeadContext(cwd, refName);
  return ctx.preferredHeadSelector;
}

async function collectRangeContext(cwd, range) {
  const [commitSummary, diffSummary, diffPatch] = await Promise.all([
    runGit(cwd, ['log', '--oneline', range]),
    runGit(cwd, ['diff', '--stat', range]),
    runGit(cwd, ['diff', '--no-ext-diff', '--patch', '--minimal', range], {
      maxBytes: RANGE_DIFF_PATCH_MAX_OUTPUT_BYTES,
    }),
  ]);
  return {
    commitSummary: commitSummary.stdout.trim(),
    diffSummary: diffSummary.stdout.trim(),
    diffPatch: withTruncationMarker(diffPatch.stdout, diffPatch.truncated),
  };
}

async function rangeHasCommits(cwd, range) {
  const listed = await runGit(cwd, ['rev-list', '--count', range]);
  if (listed.code !== 0) return false;
  const count = Number(listed.stdout.trim());
  return Number.isFinite(count) && count > 0;
}

async function readRangeContext(cwd) {
  const remote = await resolvePrimaryRemoteName(cwd);
  const candidates = [];
  if (remote) {
    const symbolic = await runGit(cwd, ['rev-parse', '--verify', '--quiet', `${remote}/HEAD`]);
    if (symbolic.code === 0) candidates.push(`${remote}/HEAD`);
    const defaultRef = await defaultRefName(cwd, true);
    if (defaultRef) candidates.push(`${remote}/${defaultRef}`);
  }
  const localDefault = await defaultRefName(cwd, false);
  if (localDefault) candidates.push(localDefault);

  for (const base of candidates) {
    const range = `${base}..HEAD`;
    if (await rangeHasCommits(cwd, range)) {
      return { ...(await collectRangeContext(cwd, range)), baseRef: base };
    }
  }

  const counted = await runGit(cwd, ['rev-list', '--count', 'HEAD']);
  const total = Number(counted.stdout.trim());
  const depth = Number.isFinite(total) && total > 1 ? Math.min(20, total - 1) : 0;
  if (depth > 0) {
    return { ...(await collectRangeContext(cwd, `HEAD~${depth}..HEAD`)), baseRef: `HEAD~${depth}` };
  }
  return { ...(await collectRangeContext(cwd, 'HEAD')), baseRef: 'HEAD' };
}

async function gitCreateChangeRequest(cwd, input, onProgress) {
  const emit = typeof onProgress === 'function' ? onProgress : () => {};
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  const status = await gitStatus(cwd);
  const terms = changeRequestTerms(status?.sourceControlProvider);
  emit({ kind: 'phase', title: `Preparing ${terms.shortLabel}...` });
  if (!status?.refName) return fail('Cannot create a pull request from detached HEAD.');
  const providerKind = status.sourceControlProvider?.kind;
  if (providerKind !== 'github') {
    return fail(
      `Creating a ${terms.singular} for ${status.sourceControlProvider?.name || providerKind || 'this remote'} is not supported yet (requires GitHub via gh).`,
    );
  }
  if (status.hasWorkingTreeChanges) {
    return fail('Commit local changes before creating a PR.');
  }
  if (!status.hasUpstream) {
    return fail('Current branch has not been pushed. Push before creating a PR.');
  }
  const existingLookup = await lookupOpenPullRequest(root);
  const headContext = existingLookup.headContext
    || await resolveBranchHeadContext(root, status.refName);
  const branchKey = `${root}\u0000${status.refName}`;
  // Last-known is status-badge only. Do not remember null (poisons the badge
  // after a successful create when a later list flakes).
  if (existingLookup.failed) {
    return fail('Could not look up existing pull requests (gh failed). Try again.');
  }
  if (existingLookup.pr) {
    rememberLastKnownPr(branchKey, {
      pr: existingLookup.pr,
      upstreamRef: headContext.upstreamRef,
      headBranch: headContext.headBranch,
      remoteName: headContext.remoteName,
      headRemoteUrlKey: headContext.headRemoteUrlKey,
    });
  }
  const existing = existingLookup.pr;
  if (existing && existing.state === 'open' && existing.url) {
    return ok({
      status: 'opened_existing',
      url: existing.url,
      number: existing.number,
      title: existing.title,
      skipped: true,
    });
  }

  const preserveProvided = Boolean(input?.preserveProvided);
  const providedTitle = typeof input?.title === 'string' ? input.title.trim() : '';
  const providedBody = typeof input?.body === 'string' ? input.body : '';
  let title = '';
  let body = '';
  // Resolve once and reuse for range copy + `gh pr create --base`.
  const baseBranch = await resolvePrBaseBranch(root, status.refName, Boolean(status.hasPrimaryRemote));
  if (preserveProvided && providedTitle) {
    title = providedTitle;
    body = providedBody;
  } else {
    emit({ kind: 'phase', title: `Generating ${terms.shortLabel} content...` });
    const remote = await resolvePrimaryRemoteName(root);
    const baseRangeRef = remote
      ? ((await runGit(root, ['rev-parse', '--verify', '--quiet', `${remote}/${baseBranch}`])).code === 0
        ? `${remote}/${baseBranch}`
        : baseBranch)
      : baseBranch;
    const range = await collectRangeContext(root, `${baseRangeRef}..HEAD`);
    const generated = await generatePrContent({
      ...range,
      fallbackTitle: status.refName || 'Change',
      changeRequestTemplate: await readPrTemplate(root, baseRangeRef),
    });
    if (generated.error) return fail(generated.error);
    title = generated.title;
    body = generated.body;
  }
  if (!title) return fail('Change request title is required.');

  emit({ kind: 'phase', title: `Creating ${terms.singular}...` });
  const bodyFile = path.join(os.tmpdir(), `dshd-pr-body-${process.pid}-${Date.now()}.md`);
  fs.writeFileSync(bodyFile, body);
  let created;
  try {
    const headSelector = await resolvePreferredHeadSelector(root, status.refName);
    const prArgs = ['pr', 'create', '--title', title, '--body-file', bodyFile, '--head', headSelector];
    // Always pass --base when resolved (never omit when base === head name).
    if (baseBranch) prArgs.push('--base', baseBranch);
    created = await run('gh', prArgs, root, {
      timeoutMs: COMMIT_TIMEOUT_MS,
    });
  } finally {
    try {
      fs.unlinkSync(bodyFile);
    } catch {
      // Temp PR body is best-effort cleanup after gh exits.
    }
  }
  if (created.missing) return fail('gh is unavailable.');
  if (created.code !== 0) return fail(created.stderr.trim() || created.stdout.trim() || 'gh pr create failed.');
  const viewed = await readPullRequest(root);
  const url = viewed?.url || created.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  // Only remember a real lookup row — do not invent number:0 when list flakes.
  if (viewed?.url && typeof viewed.number === 'number' && viewed.number > 0) {
    rememberLastKnownPr(branchKey, {
      pr: viewed,
      upstreamRef: headContext.upstreamRef,
      headBranch: headContext.headBranch,
      remoteName: headContext.remoteName,
      headRemoteUrlKey: headContext.headRemoteUrlKey,
    });
  }
  return ok({
    status: 'created',
    url,
    number: viewed?.number,
    title: viewed?.title || title,
  });
}

async function gitPublishRepository(cwd, input, onProgress) {
  const emit = typeof onProgress === 'function' ? onProgress : () => {};
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  const remotes = await listRemoteNames(root);
  // CTA offers Publish when origin is missing; allow other remotes (e.g. upstream only).
  if (remotes.includes('origin')) return fail('This repository already has an origin remote.');
  const remoteUrl = typeof input?.remoteUrl === 'string' ? input.remoteUrl.trim() : '';
  const name = typeof input?.name === 'string' && input.name.trim()
    ? input.name.trim()
    : path.basename(root);
  const visibility = input?.visibility === 'public' ? 'public' : 'private';
  emit({ kind: 'phase', title: 'Publishing repository...' });
  const headProbe = await runGit(root, ['rev-parse', '--verify', 'HEAD']);
  const hasCommits = headProbe.code === 0;
  if (remoteUrl) {
    const added = await runGit(root, ['remote', 'add', 'origin', remoteUrl]);
    if (added.code !== 0) return fail(gitFailureMessage(added, 'git remote add failed.'));
    // Empty repo → remote_added without push (avoids opaque HEAD refspec failure).
    if (!hasCommits) return ok({ status: 'remote_added', remoteName: 'origin', url: remoteUrl });
    const pushed = await gitPush(root, onProgress);
    if (!pushed.ok) return pushed;
    return { ...pushed, url: remoteUrl, remoteName: 'origin' };
  }
  const createArgs = [
    'repo', 'create', name,
    visibility === 'private' ? '--private' : '--public',
    '--source=.',
    '--remote=origin',
    // Non-TTY Electron cannot answer gh's confirm prompt; --yes skips it.
    '--yes',
  ];
  if (hasCommits) createArgs.push('--push');
  const created = await run('gh', createArgs, root, { timeoutMs: COMMIT_TIMEOUT_MS });
  if (created.missing) return fail('gh is unavailable.');
  if (created.code !== 0) return fail(created.stderr.trim() || created.stdout.trim() || 'gh repo create failed.');
  const urlLine = created.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  return ok({
    status: hasCommits ? 'created' : 'remote_added',
    url: urlLine,
    remoteName: 'origin',
  });
}

async function openWorkspacePath(cwd, relativePath) {
  const { root, rel } = resolveGitPath(cwd, relativePath);
  if (!root) return fail('Git status is unavailable.');
  if (!rel) return fail('Path is outside the workspace.');
  try {
    const { shell } = require('electron');
    const error = await shell.openPath(path.join(root, rel));
    return error ? fail(error) : ok();
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to open file');
  }
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
  const target = resolveInsideWorkspace(cwd, relativePath);
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
  const { root, rel } = resolveGitPath(cwd, relativePath);
  if (!root) return fail('Git status is unavailable.');
  if (!rel) return fail('Path is outside the workspace.');
  const listed = await gitStatusEntries(cwd);
  const xy = listed.ok
    ? (listed.entries || []).find((entry) => entry.path === rel || entry.path === `${rel}/`)?.xy
    : undefined;
  if (xy === '??') {
    let directory = false;
    try {
      directory = fs.statSync(path.join(root, rel)).isDirectory();
    } catch {
      return fail('Path is missing.');
    }
    return gitPathOp(cwd, relativePath, directory ? ['clean', '-fd'] : ['clean', '-f'], 'git clean failed.');
  }
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

/**
 * Parse `git diff --numstat` rows into path / insertion / deletion triples.
 * Binary rows use `-` for both counts and become 0/0.
 * @param {string} stdout
 * @returns {{ path: string, insertions: number, deletions: number }[]}
 */
function parseNumstat(stdout) {
  const files = [];
  for (const line of String(stdout || '').split('\n')) {
    if (!line) continue;
    const tab1 = line.indexOf('\t');
    const tab2 = line.indexOf('\t', tab1 + 1);
    if (tab1 < 0 || tab2 < 0) continue;
    const ins = line.slice(0, tab1);
    const del = line.slice(tab1 + 1, tab2);
    const filePath = line.slice(tab2 + 1);
    if (!filePath) continue;
    files.push({
      path: filePath,
      insertions: ins === '-' ? 0 : Number(ins) || 0,
      deletions: del === '-' ? 0 : Number(del) || 0,
    });
  }
  return files;
}

function countUntrackedInsertions(root, rel) {
  const target = path.join(root, rel);
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return 0;
  }
  if (!stat.isFile() || stat.size > MAX_UNTRACKED_BYTES) return 0;
  const buf = fs.readFileSync(target);
  if (buf.includes(0)) return 0;
  const body = buf.toString('utf8').replace(/\r\n/g, '\n');
  const rows = body.split('\n');
  if (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
  return rows.length;
}

async function gitChangedFiles(cwd) {
  const root = asCwd(cwd);
  if (!root) return fail('Git status is unavailable.');
  const files = [];
  const head = await runGit(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  if (head.missing) return fail('Git is unavailable.');
  if (head.timedOut) return fail('Git command timed out.');
  if (head.code === 0) {
    const num = await runGit(root, ['diff', 'HEAD', '--numstat', '--find-renames']);
    if (num.timedOut) return fail('Git command timed out.');
    if (num.code !== 0) return fail(num.stderr.trim() || 'git diff --numstat failed.');
    files.push(...parseNumstat(num.stdout));
  } else {
    const staged = await runGit(root, ['diff', '--cached', '--numstat']);
    const unstaged = await runGit(root, ['diff', '--numstat']);
    if (staged.timedOut || unstaged.timedOut) return fail('Git command timed out.');
    files.push(...parseNumstat(staged.stdout), ...parseNumstat(unstaged.stdout));
  }
  const untracked = await runGit(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  if (untracked.code === 0 && untracked.stdout) {
    for (const rel of untracked.stdout.split('\0').filter(Boolean)) {
      if (files.some(file => file.path === rel)) continue;
      files.push({ path: rel, insertions: countUntrackedInsertions(root, rel), deletions: 0 });
    }
  }
  return ok({ files });
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

/**
 * Check this workspace out onto `ref`.
 * `--ignore-other-worktrees` is required: Git otherwise refuses a branch
 * already checked out in another worktree (ChisaCode, Cursor, etc.), and the
 * titlebar picker means "switch this folder", not "move the other tree".
 * @param {unknown} cwd
 * @param {unknown} ref
 */
async function gitSwitchBranch(cwd, ref) {
  const root = asCwd(cwd);
  const name = safeRefName(ref);
  if (!root) return fail('Git status is unavailable.');
  if (!name) return fail('Invalid branch name.');
  const result = await runGit(root, ['checkout', '--ignore-other-worktrees', name]);
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
  gitFetchForStatus,
  gitReadPullRequest,
  gitInit,
  gitDiff,
  gitCommit,
  gitPush,
  gitPull,
  gitCreateChangeRequest,
  gitPublishRepository,
  openWorkspacePath,
  gitStage,
  gitUnstage,
  gitDiscard,
  gitStatusEntries,
  gitChangedFiles,
  gitBranchList,
  gitSwitchBranch,
  gitCreateBranch,
  summarizeCommitMessage,
  sanitizeFeatureBranchName,
  uniqueFeatureBranchName,
  readPrTemplate,
  readRangeContext,
  parseGitHubRepositoryNameWithOwner,
  normalizeGitRemoteUrl,
  providerFromRemoteUrl,
  selectProviderContext,
  resolvePreferredHeadSelector,
  resolveBranchHeadContext,
  matchesBranchHeadContext,
  parseGhPullRequestRow,
  resolveBaseBranchForNoUpstream,
  resolvePrBaseBranch,
  setGhDefaultBranchResolver,
  setLookupOpenPullRequest,
  resetLastKnownPrCache,
  rememberLastKnownPr,
  resolveLastKnownPr,
  commitArgs,
  parseCustomCommitMessage,
  sanitizeProgressText,
  isGitAdviceLine,
  gitFailureMessage,
  inferHookName,
  parsePorcelainZ,
  parseStatusHeader,
  parseUnifiedDiff,
  run,
  gitChildEnv,
  resolveCurrentUpstream,
  resolvePushRemoteName,
  setWorkspaceAuthority,
  resetFetchCooldowns,
  GIT_TIMEOUT_MS,
  COMMIT_TIMEOUT_MS,
  FETCH_TIMEOUT_MS,
  GH_TIMEOUT_MS,
  GIT_MAX_OUTPUT_BYTES,
};
