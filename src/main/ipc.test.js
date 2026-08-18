const assert = require('node:assert/strict');
const test = require('node:test');
const { IPC_ROLES } = require('./ipc-authorization');

const ipcPath = require.resolve('./ipc');

function harnessEvent(progress = []) {
  return {
    role: IPC_ROLES.HARNESS,
    sender: {
      isDestroyed: () => false,
      send(channel, payload) {
        progress.push({ channel, payload });
      },
    },
  };
}

function leftoverMarketplaceEvent() {
  return {
    role: 'marketplace',
    sender: {
      isDestroyed: () => true,
      send() {},
    },
  };
}

function stubModule(id, exports) {
  const filename = require.resolve(id);
  const previous = require.cache[filename];
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  };
  return { filename, previous };
}

function gitStubs() {
  return {
    gitBranchList() {},
    gitChangedFiles() {},
    gitCommit() {},
    gitCreateBranch() {},
    gitCreateChangeRequest() {},
    gitDiff() {},
    gitDiscard() {},
    gitFetchForStatus() {},
    gitInit() {},
    gitPublishRepository() {},
    gitPull() {},
    gitPush() {},
    gitReadPullRequest() {},
    gitStage() {},
    gitStatus() {},
    gitStatusEntries() {},
    gitSwitchBranch() {},
    gitUnstage() {},
    openWorkspacePath() {},
  };
}

function loadIpc(options = {}) {
  const restoreEntries = [];
  const handlers = new Map();
  const listMarketplaceCalls = [];
  const installMarketplaceCalls = [];
  const installPluginCalls = [];
  const uninstallCalls = [];
  let startHarnessCalls = 0;
  const installResult = options.installResult || { ok: true };

  function stub(id, exports) {
    restoreEntries.push(stubModule(id, exports));
  }

  stub('electron', {
    ipcMain: {
      handle(channel, listener) {
        handlers.set(channel, listener);
      },
    },
    dialog: {},
    app: { setLoginItemSettings() {} },
    shell: { openExternal: async () => true },
    nativeTheme: { shouldUseDarkColors: false },
  });
  stub('./config', {
    REMOTE_FEATURE_ENABLED: false,
    loadConfig: () => ({
      githubToken: 'secret-token',
      locale: 'zh',
      theme: 'midnight',
      workspace: '',
    }),
    saveConfig: (patch) => patch,
    publicConfig: (config) => ({ theme: config.theme }),
    normalizeRendererConfigPatch: (patch) => patch || {},
  });
  stub('./window', {
    getMainWindow: () => null,
    getHarnessWebContents: () => null,
    openHarnessSettings() {},
    openMarketplace() {},
    openRemote() {},
  });
  stub('./dsh', {
    resolveNodeBin: () => 'node',
    resolveDshBin: () => 'dsh',
    sourceHarnessStatus: () => ({ present: false, built: false, root: '' }),
  });
  stub('../shared/themes', {
    listThemes: () => [],
    resolveTheme: () => ({}),
  });
  stub('./chrome', { applyAppTheme() {} });
  stub('./update', {
    checkUpdate() { return {}; },
    installUpdate: async () => ({}),
    currentVersion: () => '0.0.0',
    REPO_URL: '',
    RELEASES_PAGE: '',
  });
  stub('./marketplace-catalog', {
    listMarketplace: async (opts) => {
      listMarketplaceCalls.push(opts);
      return { ok: true, items: [] };
    },
  });
  stub('./marketplace-install', {
    listInstalledPlugins: () => ({ plugins: [] }),
    installPlugin: async (spec, opts) => {
      installPluginCalls.push({ spec, options: opts });
      return { ok: true };
    },
    uninstallPlugin: async (name, opts) => {
      uninstallCalls.push({ name, options: opts });
      return { ok: true };
    },
    installMarketplacePlugin: async (id, opts) => {
      installMarketplaceCalls.push({ id, options: opts });
      return installResult;
    },
  });
  stub('./git', gitStubs());
  stub('./preview', { registerPreviewIpc: () => ({}) });
  stub('./pty', { registerPtyIpc: () => ({}) });
  stub('./workspace-fs', {
    listDir() { return []; },
    readFile() { return ''; },
    readFileMedia() { return null; },
    writeFile() {},
  });
  stub('./ipc-authorization', {
    IPC_ROLES,
    assertIpcSender(event, roles) {
      const allowed = new Set(roles);
      if (!event?.role || !allowed.has(event.role)) {
        const error = new Error('Unauthorized IPC sender');
        error.code = 'ERR_DSH_IPC_SENDER';
        throw error;
      }
      return event.role;
    },
  });

  const previousIpc = require.cache[ipcPath];
  delete require.cache[ipcPath];
  const { registerIpc } = require('./ipc');
  registerIpc({
    dsh: { snapshot: () => ({}) },
    harness: null,
    startHarness: async () => {
      startHarnessCalls += 1;
    },
    remote: null,
  });

  async function invoke(channel, event, ...args) {
    const listener = handlers.get(channel);
    assert.equal(typeof listener, 'function', `missing ${channel}`);
    return listener(event, ...args);
  }

  function restore() {
    delete require.cache[ipcPath];
    if (previousIpc) require.cache[ipcPath] = previousIpc;
    for (const { filename, previous } of restoreEntries) {
      if (previous) require.cache[filename] = previous;
      else delete require.cache[filename];
    }
  }

  return {
    handlers,
    invoke,
    restore,
    listMarketplaceCalls,
    installMarketplaceCalls,
    installPluginCalls,
    uninstallCalls,
    startHarness() {
      return startHarnessCalls;
    },
  };
}

test('shell:list-marketplace forwards locale and refresh without a GitHub token', async () => {
  const ipc = loadIpc();
  try {
    await ipc.invoke('shell:list-marketplace', harnessEvent(), {
      locale: 'en',
      refresh: true,
      token: 'renderer-token',
    });
    assert.equal(ipc.listMarketplaceCalls.length, 1);
    assert.deepEqual(ipc.listMarketplaceCalls[0], { locale: 'en', refresh: true });
  } finally {
    ipc.restore();
  }
});

test('shell:refresh-marketplace forwards locale and defaults to zh', async () => {
  const ipc = loadIpc();
  try {
    await ipc.invoke('shell:refresh-marketplace', harnessEvent());
    await ipc.invoke('shell:refresh-marketplace', harnessEvent(), { locale: 'en', token: 'renderer-token' });
    assert.deepEqual(ipc.listMarketplaceCalls, [
      { locale: 'zh', refresh: true },
      { locale: 'en', refresh: true },
    ]);
  } finally {
    ipc.restore();
  }
});

test('marketplace catalog and plugin channels reject marketplace senders', async () => {
  const ipc = loadIpc();
  try {
    const sender = leftoverMarketplaceEvent();
    const unauthorized = (error) => error.code === 'ERR_DSH_IPC_SENDER';
    await assert.rejects(() => ipc.invoke('shell:list-marketplace', sender, {}), unauthorized);
    await assert.rejects(() => ipc.invoke('shell:refresh-marketplace', sender), unauthorized);
    await assert.rejects(() => ipc.invoke('shell:list-installed-plugins', sender), unauthorized);
    await assert.rejects(() => ipc.invoke('shell:uninstall-plugin', sender, 'pkg'), unauthorized);
    await assert.rejects(() => ipc.invoke('shell:install-marketplace-plugin', sender, 'owner/name'), unauthorized);
  } finally {
    ipc.restore();
  }
});

test('config surfaces reject leftover marketplace senders', async () => {
  const ipc = loadIpc();
  try {
    const sender = leftoverMarketplaceEvent();
    const unauthorized = (error) => error.code === 'ERR_DSH_IPC_SENDER';
    await assert.rejects(() => ipc.invoke('shell:get-config', sender), unauthorized);
    await assert.rejects(() => ipc.invoke('shell:save-config', sender, { theme: 'midnight' }), unauthorized);
    await assert.rejects(() => ipc.invoke('shell:open-external', sender, 'https://example.com'), unauthorized);
  } finally {
    ipc.restore();
  }
});

test('shell:seed-install-draft is not registered', () => {
  const ipc = loadIpc();
  try {
    assert.equal(ipc.handlers.has('shell:seed-install-draft'), false);
  } finally {
    ipc.restore();
  }
});

test('shell:install-marketplace-plugin passes allowBuilds token and onProgress only', async () => {
  const ipc = loadIpc();
  try {
    const progress = [];
    const runPlugin = () => {};
    await ipc.invoke(
      'shell:install-marketplace-plugin',
      harnessEvent(progress),
      'owner/name',
      { allowBuilds: ['pkg'], runPlugin, token: 'renderer-token' },
    );
    assert.equal(ipc.installMarketplaceCalls.length, 1);
    assert.equal(ipc.installMarketplaceCalls[0].id, 'owner/name');
    const opts = ipc.installMarketplaceCalls[0].options;
    assert.deepEqual(Object.keys(opts).sort(), ['allowBuilds', 'onProgress', 'token']);
    assert.deepEqual(opts.allowBuilds, ['pkg']);
    assert.equal(opts.token, 'secret-token');
    assert.equal(typeof opts.onProgress, 'function');
    assert.equal(ipc.startHarness(), 1);
    opts.onProgress({ phase: 'start', line: 'installing' });
    assert.deepEqual(progress.at(-1), {
      channel: 'shell:plugin-progress',
      payload: { phase: 'start', line: 'installing' },
    });
  } finally {
    ipc.restore();
  }
});

test('shell:install-marketplace-plugin does not restart harness when install fails', async () => {
  const ipc = loadIpc({ installResult: { ok: false, error: '未收录该插件' } });
  try {
    const result = await ipc.invoke(
      'shell:install-marketplace-plugin',
      harnessEvent(),
      'missing/plugin',
      { allowBuilds: [], runPlugin: () => {} },
    );
    assert.equal(result.ok, false);
    assert.equal(ipc.startHarness(), 0);
  } finally {
    ipc.restore();
  }
});

test('shell:install-plugin does not spread renderer options onto the installer', async () => {
  const ipc = loadIpc();
  try {
    await ipc.invoke(
      'shell:install-plugin',
      harnessEvent(),
      'github:acme/demo',
      { allowBuilds: ['demo'], runPlugin: () => {}, token: 'renderer-token' },
    );
    const opts = ipc.installPluginCalls[0].options;
    assert.deepEqual(Object.keys(opts).sort(), ['allowBuilds', 'onProgress', 'token']);
    assert.equal(opts.token, 'secret-token');
    assert.equal(opts.runPlugin, undefined);
  } finally {
    ipc.restore();
  }
});
