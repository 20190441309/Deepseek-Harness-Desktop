const EventEmitter = require('events');

const DEFAULT_STABLE_MS = 60_000;
const MAX_RESTART_DELAY_MS = 30_000;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || 'Harness 启动失败');
}

function operationCancelled(message = 'Harness 启动已取消') {
  const error = new Error(message);
  error.code = 'HARNESS_OPERATION_CANCELLED';
  return error;
}

function isCancellation(error) {
  return error?.code === 'DSH_CANCELLED' || error?.code === 'HARNESS_OPERATION_CANCELLED';
}

class HarnessController extends EventEmitter {
  constructor(options) {
    super();
    this.dsh = options.dsh;
    this.remote = options.remote;
    this.loadConfig = options.loadConfig;
    this.createMainWindow = options.createMainWindow;
    this.getMainWindow = options.getMainWindow;
    this.showBoot = options.showBoot;
    this.showHarness = options.showHarness;
    this.sendToBoot = options.sendToBoot;
    this.isBootLoaded = options.isBootLoaded || (() => false);
    this.resolveLaunchTarget = options.resolveLaunchTarget;
    this.stripDroppedPlugins = options.stripDroppedPlugins;
    this.ensureWorkspace = options.ensureWorkspace;
    this.setTimer = options.setTimer || setTimeout;
    this.clearTimer = options.clearTimer || clearTimeout;
    this.now = options.now || Date.now;
    this.stableMs = Number(options.stableMs) >= 0
      ? Number(options.stableMs)
      : DEFAULT_STABLE_MS;

    this.operation = null;
    this.operationGeneration = 0;
    this.restartOperation = null;
    this.recoveryTimer = null;
    this.stableTimer = null;
    this.recoveryTask = null;
    this.recoveryGeneration = 0;
    this.shuttingDown = false;
    this.recovery = {
      status: 'inactive',
      attempt: 0,
      nextRetryAt: null,
      reason: '',
    };

    this.onDshState = (snapshot) => {
      this.sendState(snapshot);
      if (!this.shuttingDown && snapshot?.state === 'error' && snapshot?.failure?.phase === 'runtime') {
        this.operationGeneration += 1;
        this.beginRuntimeRecovery().catch((error) => {
          this.dsh.log(`恢复流程失败：${errorMessage(error)}`, 'error');
        });
      }
    };
    this.onDshLog = (line) => this.sendToBoot('shell:log', line);
    this.dsh.on('state', this.onDshState);
    this.dsh.on('log', this.onDshLog);
  }

  policy() {
    const config = this.loadConfig() || {};
    return {
      enabled: config.harnessAutoRestart !== false,
      maxAttempts: Number(config.harnessRestartMaxAttempts) || 3,
      baseDelayMs: Number(config.harnessRestartBaseDelayMs) || 1000,
    };
  }

  snapshot(dshSnapshot = this.dsh.snapshot()) {
    const policy = this.policy();
    return {
      ...dshSnapshot,
      recovery: {
        ...this.recovery,
        enabled: policy.enabled,
        maxAttempts: policy.maxAttempts,
      },
    };
  }

  sendState(dshSnapshot) {
    const snapshot = this.snapshot(dshSnapshot);
    this.sendToBoot('shell:state', snapshot);
    this.emit('state', snapshot);
    return snapshot;
  }

  setRecovery(patch) {
    this.recovery = { ...this.recovery, ...patch };
    return this.sendState();
  }

  clearRecoveryTimer() {
    if (this.recoveryTimer) {
      this.clearTimer(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  clearStableTimer() {
    if (this.stableTimer) {
      this.clearTimer(this.stableTimer);
      this.stableTimer = null;
    }
  }

  clearTimers() {
    this.clearRecoveryTimer();
    this.clearStableTimer();
  }

  async ensureBootVisible() {
    const win = this.getMainWindow();
    if (!win || !this.isBootLoaded(win)) {
      await this.showBoot();
    }
  }

  async beginRuntimeRecovery() {
    if (this.recoveryTask) {
      return this.recoveryTask;
    }
    const generation = ++this.recoveryGeneration;
    const task = (async () => {
      this.clearTimers();
      await Promise.allSettled([
        this.remote?.sync?.(),
        this.ensureBootVisible(),
      ]);
      if (this.shuttingDown || generation !== this.recoveryGeneration) {
        return this.snapshot();
      }
      return this.scheduleRecovery();
    })().finally(() => {
      if (this.recoveryTask === task) {
        this.recoveryTask = null;
      }
    });
    this.recoveryTask = task;
    return task;
  }

  scheduleRecovery() {
    if (this.shuttingDown) {
      return this.snapshot();
    }
    this.clearRecoveryTimer();
    const policy = this.policy();
    const consumedAttempts = this.recovery.attempt || 0;
    if (!policy.enabled) {
      return this.setRecovery({
        status: 'cancelled',
        attempt: consumedAttempts,
        nextRetryAt: null,
        reason: 'disabled',
      });
    }
    if (consumedAttempts >= policy.maxAttempts) {
      return this.setRecovery({
        status: 'exhausted',
        attempt: consumedAttempts,
        nextRetryAt: null,
        reason: 'attempts-exhausted',
      });
    }

    const attempt = consumedAttempts + 1;
    const delay = Math.min(
      policy.baseDelayMs * (2 ** (attempt - 1)),
      MAX_RESTART_DELAY_MS,
    );
    const nextRetryAt = this.now() + delay;
    const snapshot = this.setRecovery({
      status: 'scheduled',
      attempt,
      nextRetryAt,
      reason: '',
    });
    this.recoveryTimer = this.setTimer(() => {
      this.recoveryTimer = null;
      this.runAutomaticRestart(attempt).catch((error) => {
        this.dsh.log(`自动恢复失败：${errorMessage(error)}`, 'error');
      });
    }, delay);
    return snapshot;
  }

  async runAutomaticRestart(attempt) {
    if (this.shuttingDown || this.recovery.status !== 'scheduled' || this.recovery.attempt !== attempt) {
      return this.snapshot();
    }
    const recoveryGeneration = this.recoveryGeneration;
    this.setRecovery({ status: 'restarting', nextRetryAt: null, reason: '' });
    try {
      await this.replaceOperation({ showBoot: false });
      if (this.shuttingDown || recoveryGeneration !== this.recoveryGeneration) {
        return this.snapshot();
      }
      this.startStableWindow(attempt);
      return this.snapshot();
    } catch (error) {
      if (this.shuttingDown || recoveryGeneration !== this.recoveryGeneration) {
        throw error;
      }
      await this.ensureBootVisible().catch(() => {});
      this.recovery = {
        ...this.recovery,
        status: 'failed',
        attempt,
        nextRetryAt: null,
      };
      this.scheduleRecovery();
      throw error;
    }
  }

  startStableWindow(attempt) {
    this.clearStableTimer();
    this.setRecovery({ status: 'monitoring', attempt, nextRetryAt: null, reason: '' });
    this.stableTimer = this.setTimer(() => {
      this.stableTimer = null;
      if (this.shuttingDown || this.dsh.state !== 'ready') {
        return;
      }
      this.setRecovery({ status: 'inactive', attempt: 0, nextRetryAt: null, reason: '' });
    }, this.stableMs);
  }

  runOperation(work) {
    if (this.operation) {
      return this.operation;
    }
    const generation = ++this.operationGeneration;
    const task = Promise.resolve()
      .then(() => work(generation))
      .finally(() => {
        if (this.operation === task) {
          this.operation = null;
        }
      });
    this.operation = task;
    return task;
  }

  assertOperationCurrent(generation) {
    if (this.shuttingDown || generation !== this.operationGeneration) {
      throw operationCancelled();
    }
  }

  start() {
    return this.runOperation((generation) => this.performStart({ showBoot: true, generation }));
  }

  async replaceOperation({ showBoot }) {
    const previousOperation = this.operation;
    this.operationGeneration += 1;
    await this.dsh.stop();
    await previousOperation?.catch(() => {});
    if (this.shuttingDown) {
      throw operationCancelled();
    }
    return this.runOperation((generation) => this.performStart({ showBoot, generation }));
  }

  restart() {
    if (this.restartOperation) {
      return this.restartOperation;
    }
    this.recoveryGeneration += 1;
    this.recoveryTask = null;
    this.clearTimers();
    this.recovery = { status: 'inactive', attempt: 0, nextRetryAt: null, reason: '' };
    const task = this.replaceOperation({ showBoot: true }).finally(() => {
      if (this.restartOperation === task) {
        this.restartOperation = null;
      }
    });
    this.restartOperation = task;
    return task;
  }

  setStartupFailure(error) {
    const message = errorMessage(error);
    const current = this.dsh.snapshot();
    if (current.failure?.phase === 'runtime') {
      return;
    }
    if (current.state !== 'error' || current.failure?.phase !== 'startup') {
      this.dsh.setState('error', {
        error: message,
        failure: {
          phase: 'startup',
          message,
          code: null,
          signal: null,
          occurredAt: new Date(this.now()).toISOString(),
        },
      });
      this.dsh.log(message, 'error');
    }
  }

  async performStart({ showBoot, generation }) {
    const win = this.createMainWindow();
    if (showBoot) {
      await this.showBoot();
    }
    this.assertOperationCurrent(generation);
    try {
      this.dsh.setState('starting', { error: '', failure: null });
      const target = await this.resolveLaunchTarget();
      try {
        this.stripDroppedPlugins();
      } catch (error) {
        this.dsh.log(`插件清理失败：${errorMessage(error)}`, 'app');
      }
      const url = await this.dsh.start(target);
      this.assertOperationCurrent(generation);
      if (this.dsh.state !== 'ready') {
        throw operationCancelled('Harness 在打开界面前已停止');
      }
      const { workspace } = this.loadConfig();
      try {
        await this.ensureWorkspace(url, workspace);
        this.dsh.log(`已注册工作区 ${workspace}`);
      } catch (error) {
        this.dsh.log(`工作区自动注册跳过：${errorMessage(error)}`, 'app');
      }
      this.assertOperationCurrent(generation);
      if (this.dsh.state !== 'ready') {
        throw operationCancelled('Harness 在打开界面前已停止');
      }
      try {
        await this.showHarness(url);
        this.assertOperationCurrent(generation);
        if (this.dsh.state !== 'ready') {
          throw operationCancelled('Harness 在界面加载期间已停止');
        }
      } catch (error) {
        if (isCancellation(error) || this.dsh.failure?.phase === 'runtime') {
          await this.ensureBootVisible().catch(() => {});
          throw isCancellation(error)
            ? error
            : operationCancelled('Harness 在界面加载期间已停止');
        }
        await this.dsh.stop();
        throw new Error(`Web UI 加载失败：${errorMessage(error)}`);
      }
      try {
        await this.remote?.sync?.();
      } catch (error) {
        this.dsh.log(`手机 Remote 同步失败：${errorMessage(error)}`, 'app');
      }
      if (this.loadConfig().openDevTools) {
        win.webContents.openDevTools({ mode: 'detach' });
      }
      return url;
    } catch (error) {
      if (!this.shuttingDown && !isCancellation(error)) {
        this.setStartupFailure(error);
        await this.ensureBootVisible().catch(() => {});
        this.sendState();
      }
      throw error;
    }
  }

  reload() {
    const win = this.getMainWindow();
    if (!win) {
      return Promise.resolve(null);
    }
    if (this.dsh.state === 'ready' && this.dsh.baseUrl) {
      return win.loadURL(this.dsh.baseUrl);
    }
    return this.start();
  }

  cancelRecovery() {
    this.recoveryGeneration += 1;
    this.recoveryTask = null;
    this.clearTimers();
    return this.setRecovery({
      status: 'cancelled',
      nextRetryAt: null,
      reason: 'user',
    });
  }

  refreshPolicy() {
    const policy = this.policy();
    if (!policy.enabled && this.recovery.status === 'scheduled') {
      this.recoveryGeneration += 1;
      this.clearTimers();
      return this.setRecovery({
        status: 'cancelled',
        nextRetryAt: null,
        reason: 'disabled',
      });
    }
    if (this.recovery.status === 'scheduled' && this.recovery.attempt > policy.maxAttempts) {
      this.clearRecoveryTimer();
      return this.setRecovery({
        status: 'exhausted',
        nextRetryAt: null,
        reason: 'attempts-exhausted',
      });
    }
    return this.sendState();
  }

  async shutdown() {
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;
    this.recoveryGeneration += 1;
    this.recoveryTask = null;
    this.clearTimers();
    const currentOperation = this.operation;
    const currentRestart = this.restartOperation;
    await Promise.allSettled([
      this.dsh.stop(),
      this.remote?.stop?.(),
      currentOperation,
      currentRestart,
    ].filter(Boolean));
    this.dsh.off('state', this.onDshState);
    this.dsh.off('log', this.onDshLog);
  }
}

module.exports = {
  HarnessController,
  DEFAULT_STABLE_MS,
  MAX_RESTART_DELAY_MS,
};
