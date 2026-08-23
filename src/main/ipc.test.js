const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

function bootEvent() {
  return {
    role: IPC_ROLES.BOOT,
    sender: {
      isDestroyed: () => false,
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
  const listWallpaperCatalogCalls = [];
  const installMarketplaceCalls = [];
  const installPluginCalls = [];
  const uninstallCalls = [];
  const saveConfigCalls = [];
  let startHarnessCalls = 0;
  const installResult = options.installResult || { ok: true };
  const startHarnessImpl = options.startHarness || (async () => {});

  function stub(id, exports) {
    restoreEntries.push(stubModule(id, exports));
  }

  stub('electron', {
    ipcMain: {
      handle(channel, listener) {
        handlers.set(channel, listener);
      },
    },
    dialog: {
      showSaveDialog: options.showSaveDialog || (async () => ({ canceled: true })),
    },
    app: {
      setLoginItemSettings() {},
      getPath: options.getPath || ((name) => (name === 'downloads' ? '/tmp/downloads' : '/tmp')),
    },
    shell: { openExternal: async () => true },
    nativeTheme: { shouldUseDarkColors: false },
  });
  stub('./config', {
    REMOTE_FEATURE_ENABLED: options.remoteFeatureEnabled ?? false,
    loadConfig: () => ({
      githubToken: 'secret-token',
      locale: 'zh',
      theme: 'midnight',
      workspace: '',
    }),
    saveConfig: (patch) => {
      saveConfigCalls.push(patch);
      return patch;
    },
    publicConfig: (config) => ({ theme: config.theme }),
    parkRemoteSnapshot: (snap) => ({
      ...(snap && typeof snap === 'object' ? snap : {}),
      available: false,
      enabled: false,
      listening: false,
      urls: [],
      token: '',
    }),
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
  stub('./wallpaper-catalog', {
    listWallpaperCatalog: async (query) => {
      listWallpaperCatalogCalls.push(query);
      return { items: [] };
    },
    downloadWallpaper: async () => ({}),
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
    dsh: options.dsh || { snapshot: () => ({}), logs: [] },
    harness: null,
    startHarness: async () => {
      startHarnessCalls += 1;
      return startHarnessImpl();
    },
    remote: options.remote === undefined ? null : options.remote,
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
    listWallpaperCatalogCalls,
    installMarketplaceCalls,
    installPluginCalls,
    uninstallCalls,
    saveConfigCalls,
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

test('shell:refresh-marketplace forwards locale without defaulting to zh', async () => {
  const ipc = loadIpc();
  try {
    await ipc.invoke('shell:refresh-marketplace', harnessEvent());
    await ipc.invoke('shell:refresh-marketplace', harnessEvent(), { locale: 'en', token: 'renderer-token' });
    assert.deepEqual(ipc.listMarketplaceCalls, [
      { locale: undefined, refresh: true },
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

test('shell:install-marketplace-plugin does not restart harness for needsAllowBuilds', async () => {
  const ipc = loadIpc({ installResult: { ok: false, needsAllowBuilds: true, allowBuilds: ['pkg'] } });
  try {
    const result = await ipc.invoke(
      'shell:install-marketplace-plugin',
      harnessEvent(),
      'owner/name',
    );
    assert.equal(result.ok, false);
    assert.equal(result.needsAllowBuilds, true);
    assert.equal(ipc.startHarness(), 0);
  } finally {
    ipc.restore();
  }
});

test('shell:install-marketplace-plugin keeps ok when startHarness throws', async () => {
  const ipc = loadIpc({
    installResult: { ok: true, spec: 'dsh-loop' },
    startHarness: async () => {
      throw new Error('spawn failed');
    },
  });
  try {
    const result = await ipc.invoke(
      'shell:install-marketplace-plugin',
      harnessEvent(),
      'owner/name',
    );
    assert.equal(result.ok, true);
    assert.equal(result.harnessStarted, false);
    assert.match(String(result.error), /web profile/);
    assert.equal(ipc.startHarness(), 1);
  } finally {
    ipc.restore();
  }
});

test('shell:uninstall-plugin keeps ok when startHarness throws', async () => {
  const ipc = loadIpc({
    startHarness: async () => {
      throw new Error('spawn failed');
    },
  });
  try {
    const result = await ipc.invoke('shell:uninstall-plugin', harnessEvent(), 'pkg');
    assert.equal(result.ok, true);
    assert.equal(result.harnessStarted, false);
    assert.match(String(result.error), /移除/);
    assert.equal(ipc.startHarness(), 1);
  } finally {
    ipc.restore();
  }
});

test('shell:install-plugin keeps ok when startHarness throws', async () => {
  const ipc = loadIpc({
    startHarness: async () => {
      throw new Error('spawn failed');
    },
  });
  try {
    const result = await ipc.invoke('shell:install-plugin', harnessEvent(), 'github:owner/repo');
    assert.equal(result.ok, true);
    assert.equal(result.harnessStarted, false);
    assert.equal(ipc.startHarness(), 1);
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

test('shell:list-wallpaper-catalog forwards a kind query and coerces numbers', async () => {
  const ipc = loadIpc();
  try {
    await ipc.invoke('shell:list-wallpaper-catalog', harnessEvent(), {
      kind: 'wallhaven',
      year: '2024',
      url: 'https://example.com/pack.json',
      q: 'lake',
      categories: '010',
      page: '2',
    });
    await ipc.invoke('shell:list-wallpaper-catalog', harnessEvent(), {
      kind: 'nsfw',
      includeBing: true,
      catalogs: ['https://example.com/a.json'],
    });
    assert.equal(ipc.listWallpaperCatalogCalls.length, 2);
    const [wallhaven, rejected] = ipc.listWallpaperCatalogCalls;
    assert.equal(wallhaven.kind, 'wallhaven');
    assert.equal(wallhaven.year, 2024);
    assert.equal(typeof wallhaven.year, 'number');
    assert.equal(wallhaven.page, 2);
    assert.equal(typeof wallhaven.page, 'number');
    assert.equal(wallhaven.url, 'https://example.com/pack.json');
    assert.equal(wallhaven.q, 'lake');
    assert.equal(wallhaven.categories, '010');
    assert.equal(rejected.kind, undefined);
    assert.equal(rejected.includeBing, undefined);
    assert.equal(rejected.catalogs, undefined);
  } finally {
    ipc.restore();
  }
});

test('shell:save-boot-log is boot-only and writes dsh.logs not a renderer path', async () => {
  const dest = path.join(os.tmpdir(), `dshd-boot-ipc-${Date.now()}.log`);
  const logs = Array.from({ length: 81 }, (_, index) => `[app] line ${index + 1}`);
  const ipc = loadIpc({
    dsh: {
      logs,
      snapshot: () => ({
        state: 'error',
        error: 'Harness 启动失败',
        failure: { phase: 'startup', message: 'tar failed', code: null, signal: null, occurredAt: '2026-08-20T00:00:00.000Z' },
      }),
    },
    showSaveDialog: async () => ({ canceled: false, filePath: dest }),
  });
  try {
    const unauthorized = (error) => error.code === 'ERR_DSH_IPC_SENDER';
    await assert.rejects(() => ipc.invoke('shell:save-boot-log', harnessEvent()), unauthorized);
    await assert.rejects(() => ipc.invoke('shell:save-boot-log', leftoverMarketplaceEvent()), unauthorized);

    const result = await ipc.invoke('shell:save-boot-log', bootEvent(), 'C:\\evil\\from-renderer.log');
    assert.equal(result.ok, true);
    assert.equal(result.canceled, false);
    assert.equal(result.path, dest);
    const body = fs.readFileSync(dest, 'utf8');
    assert.match(body, /\[app\] line 1\n/);
    assert.match(body, /\[app\] line 81\n/);
    assert.doesNotMatch(body, /from-renderer|evil/);
  } finally {
    ipc.restore();
    fs.rmSync(dest, { force: true });
  }
});

test('shell:get-remote reports unavailable for the disabled remote stub even when the feature flag is on', async () => {
  const { createDisabledRemote } = require('./remote');
  let syncCalls = 0;
  const remote = createDisabledRemote();
  const wrapped = {
    ...remote,
    sync() {
      syncCalls += 1;
      return remote.sync();
    },
  };
  const ipc = loadIpc({ remote: wrapped, remoteFeatureEnabled: true });
  try {
    const snap = await ipc.invoke('shell:get-remote', harnessEvent());
    assert.deepEqual(snap, {
      available: false,
      enabled: false,
      listening: false,
    });
    const saved = await ipc.invoke('shell:save-remote', harnessEvent(), { remoteEnabled: true });
    assert.equal(saved.available, false);
    assert.equal(saved.enabled, false);
    assert.equal(saved.listening, false);
    assert.equal(syncCalls, 1);
  } finally {
    ipc.restore();
  }
});

test('shell:get-remote reports available for a live gateway snapshot', async () => {
  const remote = {
    snapshot() {
      return { enabled: false, listening: false };
    },
    async sync() {
      return this.snapshot();
    },
  };
  const ipc = loadIpc({ remote, remoteFeatureEnabled: true });
  try {
    const snap = await ipc.invoke('shell:get-remote', harnessEvent());
    assert.equal(snap.available, true);
    assert.equal(snap.enabled, false);
    assert.equal(snap.listening, false);
  } finally {
    ipc.restore();
  }
});

test('shell:save-remote refuses credential and workspace fields', async () => {
  const remote = {
    snapshot() {
      return { enabled: true, listening: false };
    },
    async sync() {
      return this.snapshot();
    },
  };
  const ipc = loadIpc({ remote, remoteFeatureEnabled: true });
  try {
    await assert.rejects(
      () => ipc.invoke('shell:save-remote', harnessEvent(), {
        remoteEnabled: true,
        apiKey: 'sk-stolen',
        workspace: 'C:\\',
        githubToken: 'ghp_stolen',
      }),
      /not renderer-writable|must be/,
    );
    assert.equal(ipc.saveConfigCalls.length, 0);
    const saved = await ipc.invoke('shell:save-remote', harnessEvent(), {
      remoteEnabled: true,
      remoteMode: 'lan',
    });
    assert.equal(saved.enabled, true);
    assert.deepEqual(ipc.saveConfigCalls.at(-1), {
      remoteEnabled: true,
      remoteMode: 'lan',
    });
  } finally {
    ipc.restore();
  }
});

test('shell:get-remote stays unavailable when remote is null', async () => {
  const ipc = loadIpc({ remote: null, remoteFeatureEnabled: true });
  try {
    const snap = await ipc.invoke('shell:get-remote', harnessEvent());
    assert.deepEqual(snap, {
      available: false,
      enabled: false,
      listening: false,
    });
  } finally {
    ipc.restore();
  }
});

test('shell:get-remote reports unavailable when the feature is parked', async () => {
  const remote = {
    snapshot() {
      return { available: true, enabled: true, listening: true, port: 3180, token: 'secret', urls: [{ pairingUrl: 'http://10.0.0.4:3180/#offer=x' }] };
    },
  };
  const ipc = loadIpc({ remote });
  try {
    const snap = await ipc.invoke('shell:get-remote', harnessEvent());
    assert.equal(snap.available, false);
    assert.equal(snap.enabled, false);
    assert.equal(snap.listening, false);
    assert.deepEqual(snap.urls, []);
    assert.equal(snap.token, '');
    const saved = await ipc.invoke('shell:save-remote', harnessEvent(), { remoteEnabled: true });
    assert.equal(saved.available, false);
    assert.equal(saved.enabled, false);
  } finally {
    ipc.restore();
  }
});
