const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { HarnessController } = require('./harness-controller');

class FakeClock {
  constructor() {
    this.time = 10_000;
    this.nextId = 1;
    this.timers = new Map();
  }

  setTimeout = (fn, delay) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + delay, fn });
    return id;
  };

  clearTimeout = (id) => {
    this.timers.delete(id);
  };

  async tick(ms) {
    const end = this.time + ms;
    while (true) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) {
        break;
      }
      const [id, timer] = due;
      this.timers.delete(id);
      this.time = timer.at;
      timer.fn();
      await settle();
    }
    this.time = end;
    await settle();
  }
}

class FakeDsh extends EventEmitter {
  constructor() {
    super();
    this.state = 'idle';
    this.error = '';
    this.failure = null;
    this.baseUrl = '';
    this.port = 3080;
    this.logs = [];
    this.startCalls = 0;
    this.stopCalls = 0;
    this.startResults = [];
    this.startOptions = [];
  }

  snapshot() {
    return {
      state: this.state,
      error: this.error,
      failure: this.failure,
      baseUrl: this.baseUrl,
      logs: [...this.logs],
    };
  }

  setState(state, extra = {}) {
    this.state = state;
    if (Object.prototype.hasOwnProperty.call(extra, 'error')) this.error = extra.error;
    if (Object.prototype.hasOwnProperty.call(extra, 'failure')) this.failure = extra.failure;
    if (Object.prototype.hasOwnProperty.call(extra, 'baseUrl')) this.baseUrl = extra.baseUrl;
    this.emit('state', this.snapshot());
  }

  log(line, source = 'app') {
    const entry = `[${source}] ${line}`;
    this.logs.push(entry);
    this.emit('log', entry);
  }

  async start(options = {}) {
    this.startCalls += 1;
    this.startOptions.push(options);
    const result = this.startResults.length ? this.startResults.shift() : 'http://127.0.0.1:3080';
    if (result instanceof Error) {
      if (result.pluginTree) this.log('plugin tree failed to load', 'dsh');
      this.setState('error', {
        error: result.message,
        failure: { phase: 'startup', message: result.message },
      });
      throw result;
    }
    this.setState('ready', { baseUrl: result, error: '', failure: null });
    return result;
  }

  async stop() {
    this.stopCalls += 1;
    this.setState('idle', { error: '', failure: null });
  }

  crash(message = 'dsh exited') {
    this.setState('error', {
      error: message,
      failure: {
        phase: 'runtime',
        message,
        code: 1,
        signal: null,
        occurredAt: Date.now(),
      },
    });
  }
}

function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

function fixture(overrides = {}) {
  const clock = new FakeClock();
  const dsh = new FakeDsh();
  const events = [];
  const window = {
    url: 'file:///boot.html',
    webContents: {
      openDevTools: () => events.push('devtools'),
      getURL: () => window.url,
    },
    loadURL: async (url) => {
      window.url = url;
      events.push(`reload:${url}`);
    },
  };
  let config = {
    workspace: 'C:/workspace',
    harnessAutoRestart: true,
    harnessRestartMaxAttempts: 3,
    harnessRestartBaseDelayMs: 1000,
    openDevTools: false,
    pluginRecovery: { skipUserPlugins: false, reason: '', at: '', appVersion: '' },
  };
  if (overrides.initialConfig) {
    config = { ...config, ...overrides.initialConfig };
  }
  const remote = {
    syncCalls: 0,
    stopCalls: 0,
    async sync() {
      this.syncCalls += 1;
      events.push('remote:sync');
    },
    async stop() {
      this.stopCalls += 1;
      events.push('remote:stop');
    },
  };
  const controller = new HarnessController({
    dsh,
    remote,
    loadConfig: () => config,
    createMainWindow: () => window,
    getMainWindow: () => window,
    showBoot: async () => {
      window.url = 'file:///boot.html';
      events.push('boot');
    },
    showHarness: async (url) => {
      window.url = url;
      events.push(`harness:${url}`);
    },
    sendToBoot: (channel, payload) => events.push(`${channel}:${payload?.recovery?.status || payload?.state || payload}`),
    isBootLoaded: (win) => win.url.includes('boot.html'),
    resolveLaunchTarget: async () => ({ port: 3080 }),
    stripDroppedPlugins: () => {},
    ensureWorkspace: async () => {},
    saveConfig: (patch) => {
      config = { ...config, ...patch };
    },
    appVersion: '1.2.3',
    setTimer: clock.setTimeout,
    clearTimer: clock.clearTimeout,
    now: () => clock.time,
    stableMs: 60_000,
    ...overrides,
  });
  return {
    clock,
    dsh,
    events,
    window,
    remote,
    controller,
    setConfig(patch) {
      config = { ...config, ...patch };
    },
  };
}

test('writes the desktop install plugin before launching Harness', async () => {
  const calls = [];
  const f = fixture({
    ensureDesktopInstallPlugin: () => {
      calls.push('ensure');
    },
  });
  await f.controller.start();
  assert.deepEqual(calls, ['ensure']);
});

test('awaits the dshmarket preset after the desktop install plugin and before Harness start', async () => {
  const order = [];
  const f = fixture({
    ensureDesktopInstallPlugin: () => {
      order.push('desktop-install');
      return { ok: true };
    },
    ensureDshMarketPlugin: async () => {
      order.push('dshmarket');
      return { ok: true, added: true };
    },
  });
  const origStart = f.dsh.start.bind(f.dsh);
  f.dsh.start = async (options) => {
    order.push('start');
    return origStart(options);
  };
  await f.controller.start();
  assert.deepEqual(order, ['desktop-install', 'dshmarket', 'start']);
});

test('logs and continues when the dshmarket preset fails', async () => {
  const f = fixture({
    ensureDshMarketPlugin: async () => ({ ok: false, error: 'offline' }),
  });
  await f.controller.start();
  assert.equal(f.dsh.startCalls, 1);
  assert.ok(f.dsh.logs.some((line) => /dshmarket/.test(line) && /offline/.test(line)));
});

test('hides dshbot after dshmarket and before Harness start', async () => {
  const order = [];
  const f = fixture({
    ensureDesktopInstallPlugin: () => {
      order.push('desktop-install');
      return { ok: true };
    },
    ensureDshMarketPlugin: async () => {
      order.push('dshmarket');
      return { ok: true, added: true };
    },
    hideDshbotPlugin: async () => {
      order.push('dshbot-hide');
      return { ok: true, stripped: true };
    },
  });
  const origStart = f.dsh.start.bind(f.dsh);
  f.dsh.start = async (options) => {
    order.push('start');
    return origStart(options);
  };
  await f.controller.start();
  assert.deepEqual(order, ['desktop-install', 'dshmarket', 'dshbot-hide', 'start']);
  assert.ok(f.dsh.logs.some((line) => /已隐藏预置 dshbot/.test(line)));
});

test('refuses to start Harness when hiding dshbot fails', async () => {
  const f = fixture({
    hideDshbotPlugin: async () => ({ ok: false, error: 'invalid-profile' }),
  });
  await assert.rejects(() => f.controller.start(), /dshbot|invalid-profile/);
  assert.equal(f.dsh.startCalls, 0);
});

test('plugin-tree startup failure retries once with the official template overlay', async () => {
  const first = Object.assign(new Error('dsh exited'), { pluginTree: true });
  const f = fixture({
    ensureDesktopInstallPlugin: () => ({ ok: true, patchFile: 'C:/desktop-install.yml' }),
  });
  f.dsh.startResults.push(first);
  await f.controller.start();

  assert.equal(f.dsh.startCalls, 2);
  assert.equal(f.dsh.startOptions[0].skipUserPlugins, false);
  assert.deepEqual(f.dsh.startOptions[0].patchFiles, []);
  assert.equal(f.dsh.startOptions[1].skipUserPlugins, true);
  assert.deepEqual(f.dsh.startOptions[1].patchFiles, ['C:/desktop-install.yml']);
  assert.equal(f.controller.snapshot().pluginRecovery.skipUserPlugins, true);
});

test('sticky plugin recovery starts skip mode and retryFullPlugins clears it', async () => {
  const f2 = fixture({
    appVersion: '1.2.3',
    initialConfig: {
      pluginRecovery: {
        skipUserPlugins: true,
        reason: 'plugin tree failed',
        at: '2026-08-18T00:00:00.000Z',
        appVersion: '1.2.3',
      },
    },
  });
  await f2.controller.start();
  assert.equal(f2.dsh.startOptions[0].skipUserPlugins, true);
  await f2.controller.retryFullPlugins();
  assert.equal(f2.dsh.startOptions.at(-1).skipUserPlugins, false);
  assert.equal(f2.controller.snapshot().pluginRecovery.skipUserPlugins, false);
});

test('runtime crash returns to boot, disconnects Remote, and schedules one restart', async () => {
  const f = fixture();
  await f.controller.start();
  f.events.length = 0;
  f.dsh.crash();
  await settle();

  assert.equal(f.window.url, 'file:///boot.html');
  assert.equal(f.remote.syncCalls, 2);
  assert.equal(f.controller.snapshot().recovery.status, 'scheduled');
  assert.equal(f.controller.snapshot().recovery.attempt, 1);
  assert.equal(f.controller.snapshot().recovery.nextRetryAt, f.clock.time + 1000);
  assert.equal(f.clock.timers.size, 1);
  assert.ok(f.events.indexOf('remote:sync') >= 0);
  assert.ok(f.events.indexOf('boot') >= 0);
});

test('runtime crash during aborted Harness navigation preserves the runtime failure', async () => {
  let rejectNavigation;
  const aborted = Object.assign(new Error('net::ERR_ABORTED'), { code: 'ERR_ABORTED' });
  const f = fixture({
    showHarness: async () => new Promise((_resolve, reject) => {
      rejectNavigation = reject;
    }),
  });
  const start = f.controller.start();
  await settle();
  f.dsh.crash('crashed while loading');
  rejectNavigation(aborted);
  await assert.rejects(start, { code: 'HARNESS_OPERATION_CANCELLED' });
  await settle();

  assert.equal(f.controller.snapshot().failure.phase, 'runtime');
  assert.equal(f.controller.snapshot().failure.message, 'crashed while loading');
  assert.equal(f.controller.snapshot().recovery.status, 'scheduled');
  assert.equal(f.window.url, 'file:///boot.html');
});

test('automatic recovery uses exponential delays and exhausts the configured budget', async () => {
  const f = fixture();
  await f.controller.start();
  f.dsh.startResults.push(new Error('first failed'), new Error('second failed'), new Error('third failed'));
  f.dsh.crash();
  await settle();

  assert.equal(f.controller.snapshot().recovery.nextRetryAt - f.clock.time, 1000);
  await f.clock.tick(1000);
  assert.equal(f.controller.snapshot().recovery.status, 'scheduled');
  assert.equal(f.controller.snapshot().recovery.attempt, 2);
  assert.equal(f.controller.snapshot().recovery.nextRetryAt - f.clock.time, 2000);

  await f.clock.tick(2000);
  assert.equal(f.controller.snapshot().recovery.attempt, 3);
  assert.equal(f.controller.snapshot().recovery.nextRetryAt - f.clock.time, 4000);

  await f.clock.tick(4000);
  assert.equal(f.controller.snapshot().recovery.status, 'exhausted');
  assert.equal(f.controller.snapshot().recovery.attempt, 3);
  assert.equal(f.clock.timers.size, 0);
});

test('successful recovery retains the crash budget until the stable window completes', async () => {
  const f = fixture();
  await f.controller.start();
  f.dsh.crash();
  await settle();
  await f.clock.tick(1000);

  assert.equal(f.controller.snapshot().recovery.status, 'monitoring');
  assert.equal(f.controller.snapshot().recovery.attempt, 1);
  assert.equal(f.dsh.state, 'ready');
  await f.clock.tick(59_999);
  assert.equal(f.controller.snapshot().recovery.status, 'monitoring');
  await f.clock.tick(1);
  assert.equal(f.controller.snapshot().recovery.status, 'inactive');
  assert.equal(f.controller.snapshot().recovery.attempt, 0);
});

test('a second crash during monitoring consumes the next attempt', async () => {
  const f = fixture();
  await f.controller.start();
  f.dsh.crash();
  await settle();
  await f.clock.tick(1000);
  f.dsh.crash('again');
  await settle();

  assert.equal(f.controller.snapshot().recovery.status, 'scheduled');
  assert.equal(f.controller.snapshot().recovery.attempt, 2);
  assert.equal(f.controller.snapshot().recovery.nextRetryAt - f.clock.time, 2000);
  assert.equal(f.clock.timers.size, 1);
});

test('cancel and manual restart prevent the scheduled timer from starting another process', async () => {
  const f = fixture();
  await f.controller.start();
  f.dsh.crash();
  await settle();
  const startsBefore = f.dsh.startCalls;
  f.controller.cancelRecovery();
  await f.clock.tick(5000);
  assert.equal(f.dsh.startCalls, startsBefore);
  assert.equal(f.controller.snapshot().recovery.status, 'cancelled');

  await f.controller.restart();
  assert.equal(f.dsh.startCalls, startsBefore + 1);
  assert.equal(f.controller.snapshot().recovery.status, 'inactive');
});

test('manual restart invalidates a recovery task that is still waiting for boot navigation', async () => {
  let releaseOldNavigation;
  let bootCalls = 0;
  const f = fixture({
    showBoot: async () => {
      bootCalls += 1;
      if (bootCalls === 1) {
        await new Promise((resolve) => {
          releaseOldNavigation = resolve;
        });
      }
    },
  });
  f.window.url = 'http://127.0.0.1:3080';
  f.dsh.state = 'ready';
  f.dsh.baseUrl = f.window.url;
  f.dsh.crash();
  await settle();

  const restart = f.controller.restart();
  releaseOldNavigation();
  await restart;
  await settle();

  assert.equal(f.controller.snapshot().recovery.status, 'inactive');
  assert.equal(f.clock.timers.size, 0);
  assert.equal(f.dsh.state, 'ready');
});

test('restart during startup cancels the old operation and starts a fresh generation', async () => {
  let releaseStart;
  const f = fixture();
  const originalStart = f.dsh.start.bind(f.dsh);
  let first = true;
  f.dsh.start = async () => {
    if (first) {
      first = false;
      f.dsh.startCalls += 1;
      await new Promise((resolve) => {
        releaseStart = resolve;
      });
      const error = new Error('cancelled');
      error.code = 'DSH_CANCELLED';
      throw error;
    }
    return originalStart();
  };

  const initial = f.controller.start();
  await settle();
  const restart = f.controller.restart();
  releaseStart();
  await assert.rejects(initial, { code: 'DSH_CANCELLED' });
  await restart;

  assert.equal(f.dsh.startCalls, 2);
  assert.equal(f.dsh.state, 'ready');
  assert.equal(f.window.url, 'http://127.0.0.1:3080');
});

test('concurrent manual restarts share one operation', async () => {
  const f = fixture();
  await f.controller.start();
  const first = f.controller.restart();
  const second = f.controller.restart();
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(f.dsh.startCalls, 2);
  assert.equal(f.dsh.stopCalls, 1);
});

test('reload reopens the ready Web UI through showHarness', async () => {
  const f = fixture();
  await f.controller.start();
  f.events.length = 0;
  await f.controller.reload();
  assert.deepEqual(f.events.filter((event) => event.startsWith('harness:') || event.startsWith('reload:')), [
    'harness:http://127.0.0.1:3080',
  ]);
});

test('shutdown cancels recovery and does not navigate or restart afterward', async () => {
  const f = fixture();
  await f.controller.start();
  f.dsh.crash();
  await settle();
  const startsBefore = f.dsh.startCalls;
  await f.controller.shutdown();
  await f.clock.tick(10_000);

  assert.equal(f.dsh.startCalls, startsBefore);
  assert.equal(f.remote.stopCalls, 1);
  assert.equal(f.clock.timers.size, 0);
});

test('disabling auto restart cancels a pending recovery immediately', async () => {
  const f = fixture();
  await f.controller.start();
  f.dsh.crash();
  await settle();
  f.setConfig({ harnessAutoRestart: false });
  f.controller.refreshPolicy();

  assert.equal(f.controller.snapshot().recovery.status, 'cancelled');
  assert.equal(f.controller.snapshot().recovery.reason, 'disabled');
  assert.equal(f.clock.timers.size, 0);
});
