import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chisaBranchRows,
  chisaCheckoutStatusToVcs,
  createMobileAgent,
  discoverAgentDefaults,
  listMobileDirectory,
  runChisaGitAction,
} from './parity.js';

test('discoverAgentDefaults uses provider and cwd from the first complete agent', async () => {
  const client = {
    fetchWorkspaces() {
      throw new Error('must not fetch workspaces');
    },
  };

  assert.deepEqual(await discoverAgentDefaults(client, [
    { chisacodeAgent: { id: 'agent-1', provider: 'dsh', cwd: '/repo/desktop' } },
  ]), {
    provider: 'dsh',
    cwd: '/repo/desktop',
  });
});

test('discoverAgentDefaults falls back to daemon workspace and ready provider', async () => {
  const calls = [];
  const client = {
    async fetchWorkspaces(options) {
      calls.push(['workspaces', options]);
      return {
        entries: [{
          id: 'workspace-1',
          workspaceDirectory: '/repo/mobile',
        }],
      };
    },
    async getProvidersSnapshot(options) {
      calls.push(['providers', options]);
      return {
        entries: [
          { provider: 'codex', status: 'unavailable', enabled: true },
          { provider: 'dsh', status: 'ready', enabled: true },
        ],
      };
    },
  };

  assert.deepEqual(await discoverAgentDefaults(client, []), {
    provider: 'dsh',
    cwd: '/repo/mobile',
  });
  assert.deepEqual(calls, [
    ['workspaces', { sort: [{ key: 'activity_at', direction: 'desc' }], page: { limit: 1 } }],
    ['providers', { cwd: '/repo/mobile' }],
  ]);
});

test('createMobileAgent calls createAgent with discovered daemon defaults', async () => {
  const createCalls = [];
  const client = {
    async createAgent(options) {
      createCalls.push(options);
      return { id: 'agent-new', provider: options.provider, cwd: options.cwd, status: 'idle' };
    },
  };

  const created = await createMobileAgent(client, [
    { agent: { id: 'agent-old', provider: 'dsh', cwd: '/repo' } },
  ]);

  assert.equal(created.id, 'agent-new');
  assert.deepEqual(createCalls, [{ provider: 'dsh', cwd: '/repo' }]);
});

test('createMobileAgent rejects missing defaults and malformed daemon results visibly', async () => {
  await assert.rejects(
    () => discoverAgentDefaults({
      async fetchWorkspaces() {
        return { entries: [] };
      },
    }, []),
    /没有可用工作区/,
  );

  await assert.rejects(
    () => createMobileAgent({
      async createAgent() {
        return {};
      },
    }, [{ agent: { provider: 'dsh', cwd: '/repo' } }]),
    /没有返回会话/,
  );
});

test('chisaCheckoutStatusToVcs maps checkout and PR payloads to the mobile model', () => {
  assert.deepEqual(chisaCheckoutStatusToVcs({
    isGit: true,
    currentBranch: 'feature/mobile',
    isDirty: true,
    baseRef: 'main',
    aheadBehind: { ahead: 2, behind: 1 },
    aheadOfOrigin: 3,
    behindOfOrigin: 0,
    hasRemote: true,
    error: null,
  }, {
    status: { state: 'OPEN', number: 55, url: 'https://github.example/pr/55' },
    error: null,
  }), {
    isRepo: true,
    refName: 'feature/mobile',
    hasWorkingTreeChanges: true,
    hasUpstream: true,
    aheadCount: 3,
    behindCount: 0,
    isDefaultRef: false,
    hasPrimaryRemote: true,
    pr: { state: 'open', number: 55, url: 'https://github.example/pr/55' },
  });
});

test('chisaBranchRows maps daemon suggestions and marks the current branch', () => {
  assert.deepEqual(chisaBranchRows({
    branches: ['main', 'feature/mobile', 'origin/release'],
    branchDetails: [
      { name: 'main', hasLocal: true, hasRemote: true },
      { name: 'feature/mobile', hasLocal: true, hasRemote: false },
      { name: 'origin/release', hasLocal: false, hasRemote: true },
    ],
    error: null,
  }, 'feature/mobile'), [
    { name: 'main', isRemote: false, isCurrent: false },
    { name: 'feature/mobile', isRemote: false, isCurrent: true },
    { name: 'origin/release', isRemote: true, isCurrent: false },
  ]);
});

test('runChisaGitAction delegates mobile-safe actions and rejects structured failures', async () => {
  const calls = [];
  const client = {
    checkoutRefresh: async (...args) => { calls.push(['refresh', ...args]); return { error: null }; },
    checkoutPull: async (...args) => { calls.push(['pull', ...args]); return { error: null }; },
    checkoutCommit: async (...args) => { calls.push(['commit', ...args]); return { error: null }; },
    checkoutPush: async (...args) => { calls.push(['push', ...args]); return { error: null }; },
    checkoutPrCreate: async (...args) => { calls.push(['pr', ...args]); return { error: null }; },
    checkoutSwitchBranch: async (...args) => { calls.push(['switch', ...args]); return { error: null }; },
  };

  await runChisaGitAction(client, 'gitFetchForStatus', '/repo');
  await runChisaGitAction(client, 'gitPull', '/repo');
  await runChisaGitAction(client, 'gitCommit', '/repo', { message: 'ship parity' });
  await runChisaGitAction(client, 'gitPush', '/repo');
  await runChisaGitAction(client, 'gitCreateChangeRequest', '/repo');
  await runChisaGitAction(client, 'gitSwitchBranch', '/repo', { ref: 'feature/mobile' });
  assert.deepEqual(calls, [
    ['refresh', '/repo'],
    ['pull', '/repo'],
    ['commit', '/repo', { message: 'ship parity', addAll: true }],
    ['push', '/repo'],
    ['pr', '/repo', {}],
    ['switch', '/repo', 'feature/mobile'],
  ]);

  await assert.rejects(
    () => runChisaGitAction({
      async checkoutPush() {
        return { error: { message: 'remote rejected' } };
      },
    }, 'gitPush', '/repo'),
    /remote rejected/,
  );
  await assert.rejects(
    () => runChisaGitAction(client, 'gitCreateBranch', '/repo', { name: 'feature/new' }),
    /请在电脑端操作/,
  );
});

test('listMobileDirectory uses daemon file explorer and preserves relative paths', async () => {
  const client = {
    async listDirectory(cwd, path) {
      assert.equal(cwd, '/repo');
      assert.equal(path, '');
      return {
        entries: [
          { name: 'src', path: 'src', kind: 'directory' },
          { name: 'README.md', path: 'README.md', kind: 'file' },
        ],
      };
    },
  };

  assert.deepEqual(await listMobileDirectory(client, '/repo'), ['src/', 'README.md']);
});
