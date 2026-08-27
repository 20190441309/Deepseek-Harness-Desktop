function errorMessage(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.message === 'string') return value.message;
  return '';
}

function assertDaemonSuccess(payload, fallback) {
  const message = errorMessage(payload?.error);
  if (message) throw new Error(message);
  if (payload?.accepted === false) {
    throw new Error(errorMessage(payload) || fallback);
  }
  return payload;
}

function agentRecord(row) {
  return row?.chisacodeAgent || row?.agent || row;
}

/**
 * Resolve the provider and working directory required by DaemonClient.createAgent.
 * Existing agents are authoritative. An empty agent directory falls back to the
 * daemon's most recently active workspace and its first ready provider.
 */
async function discoverAgentDefaults(client, rows = []) {
  for (const row of rows) {
    const agent = agentRecord(row);
    if (typeof agent?.provider === 'string' && agent.provider
      && typeof agent?.cwd === 'string' && agent.cwd) {
      return { provider: agent.provider, cwd: agent.cwd };
    }
  }

  const workspaces = await client.fetchWorkspaces({
    sort: [{ key: 'activity_at', direction: 'desc' }],
    page: { limit: 1 },
  });
  const workspace = Array.isArray(workspaces?.entries) ? workspaces.entries[0] : null;
  const cwd = workspace?.workspaceDirectory || workspace?.projectRootPath || '';
  if (!cwd) {
    throw new Error('电脑端没有可用工作区；请先在电脑端打开一个项目');
  }

  const snapshot = await client.getProvidersSnapshot({ cwd });
  const providers = Array.isArray(snapshot?.entries) ? snapshot.entries : [];
  const ready = providers.find((entry) => (
    entry?.enabled !== false
    && entry?.status === 'ready'
    && typeof entry?.provider === 'string'
    && entry.provider
  ));
  if (!ready) {
    throw new Error('电脑端没有已就绪的智能体提供方；请先在电脑端完成提供方设置');
  }
  return { provider: ready.provider, cwd };
}

async function createMobileAgent(client, rows = []) {
  const defaults = await discoverAgentDefaults(client, rows);
  const agent = await client.createAgent(defaults);
  if (!agent || typeof agent.id !== 'string' || !agent.id) {
    throw new Error('电脑端没有返回会话；请重试');
  }
  return agent;
}

function chisaCheckoutStatusToVcs(status, prPayload = null) {
  assertDaemonSuccess(status, '无法读取 Git 状态');
  const isRepo = status?.isGit === true;
  const refName = typeof status?.currentBranch === 'string' ? status.currentBranch : null;
  const baseRef = typeof status?.baseRef === 'string' ? status.baseRef : null;
  const aheadCount = Number.isInteger(status?.aheadOfOrigin) ? status.aheadOfOrigin : 0;
  const behindCount = Number.isInteger(status?.behindOfOrigin) ? status.behindOfOrigin : 0;
  const rawPr = prPayload?.error ? null : prPayload?.status;
  const pr = rawPr && typeof rawPr === 'object'
    ? {
        state: typeof rawPr.state === 'string' ? rawPr.state.toLowerCase() : null,
        number: Number.isInteger(rawPr.number) ? rawPr.number : null,
        url: typeof rawPr.url === 'string' ? rawPr.url : null,
      }
    : null;
  return {
    isRepo,
    refName,
    hasWorkingTreeChanges: status?.isDirty === true,
    hasUpstream: Number.isInteger(status?.aheadOfOrigin) || Number.isInteger(status?.behindOfOrigin),
    aheadCount,
    behindCount,
    isDefaultRef: Boolean(refName && baseRef && refName === baseRef),
    hasPrimaryRemote: status?.hasRemote === true,
    pr,
  };
}

function chisaBranchRows(payload, currentRef = '') {
  assertDaemonSuccess(payload, '无法列出分支');
  const branches = Array.isArray(payload?.branches) ? payload.branches : [];
  const details = Array.isArray(payload?.branchDetails) ? payload.branchDetails : [];
  const detailByName = new Map(details.map((detail) => [detail?.name, detail]));
  return branches.flatMap((name) => {
    if (typeof name !== 'string' || !name) return [];
    const detail = detailByName.get(name);
    const isRemote = detail
      ? detail.hasRemote === true && detail.hasLocal !== true
      : name.startsWith('origin/');
    return [{
      name,
      isRemote,
      isCurrent: !isRemote && name === currentRef,
    }];
  });
}

async function runChisaGitAction(client, name, cwd, extra = {}) {
  let result;
  if (name === 'gitFetchForStatus') {
    result = await client.checkoutRefresh(cwd);
  } else if (name === 'gitPull') {
    result = await client.checkoutPull(cwd);
  } else if (name === 'gitCommit') {
    result = await client.checkoutCommit(cwd, {
      message: extra.message || undefined,
      addAll: true,
    });
  } else if (name === 'gitPush') {
    result = await client.checkoutPush(cwd);
  } else if (name === 'gitCreateChangeRequest') {
    result = await client.checkoutPrCreate(cwd, {});
  } else if (name === 'gitSwitchBranch') {
    result = await client.checkoutSwitchBranch(cwd, extra.ref);
  } else {
    throw new Error('此 Git 操作尚不支持手机端；请在电脑端操作');
  }
  return assertDaemonSuccess(result, 'Git 操作失败');
}

async function listMobileDirectory(client, cwd, relativePath = '') {
  const directory = await client.listDirectory(cwd, relativePath);
  const entries = Array.isArray(directory?.entries) ? directory.entries : [];
  return entries.flatMap((entry) => {
    const path = typeof entry?.path === 'string' && entry.path
      ? entry.path
      : typeof entry?.name === 'string' ? entry.name : '';
    if (!path) return [];
    return [entry?.kind === 'directory' ? `${path.replace(/\/$/, '')}/` : path];
  });
}

export {
  chisaBranchRows,
  chisaCheckoutStatusToVcs,
  createMobileAgent,
  discoverAgentDefaults,
  listMobileDirectory,
  runChisaGitAction,
};
