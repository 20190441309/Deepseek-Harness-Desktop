'use strict';

/**
 * DshManager 生命周期单测（node:test）。
 * 全部使用 fake child（EventEmitter）+ 依赖注入，不启动真实进程、不依赖 Electron。
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DshManager } = require('./dsh');
const { readPin } = require('../shared/harness-upstream');

const EXPECTED_URL = 'http://127.0.0.1:3080';
const CHILD_PID = 4242;

const tick = (ms = 2) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(fn, { timeout = 3000, interval = 2 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (fn()) {
      return;
    }
    await tick(interval);
  }
  throw new Error(`waitFor 超时：${fn.toString()}`);
}

function makeFakeChild(pid = CHILD_PID) {
  const child = new EventEmitter();
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    return true;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

function emitExit(child, code, signal = null) {
  child.exitCode = code;
  child.signalCode = signal;
  child.emit('exit', code, signal);
}

/**
 * 构造注入全部依赖的 manager。返回：
 *  - manager: DshManager 实例
 *  - spawned: 每次 spawnHarness 产生的 fake child
 *  - calls:   { writePid, clearPid, killTree, killOwned, readPid } 调用记录
 *  - setReachable(v): 控制 isReachable 结果
 *  - lastChild(): 最近 spawn 的 child
 */
function makeHarness(overrides = {}) {
  const spawned = [];
  const calls = {
    writePid: [],
    clearPid: 0,
    killTree: [],
    killOwned: 0,
    readPid: 0,
  };
  let reachable = false;
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-test-'));
  const deps = {
    loadConfig: () => ({ workspace, host: '127.0.0.1', port: 3080 }),
    ensurePackagedHarness: async () => null,
    buildLaunch: (config) => ({
      command: 'node',
      args: ['web', '--host', config.host || '127.0.0.1', '--port', String(config.port || 3080), '--no-open'],
      nodeBin: null,
      kind: 'dsh',
      host: config.host || '127.0.0.1',
      port: Number(config.port) || 3080,
      workspace: config.workspace,
    }),
    spawnHarness: () => {
      const pid = overrides.childPid !== undefined ? overrides.childPid : CHILD_PID;
      const child = makeFakeChild(pid);
      spawned.push(child);
      if (reachable && overrides.announceReady !== false) {
        queueMicrotask(() => child.stdout.emit('data', Buffer.from(`dsh web: ${EXPECTED_URL}\n`)));
      }
      return child;
    },
    isReachable: async () => reachable,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 2))),
    readPidFile: () => {
      calls.readPid += 1;
      return null;
    },
    writePidFile: (pid) => {
      calls.writePid.push(pid);
    },
    clearPidFile: () => {
      calls.clearPid += 1;
    },
    killTree: (pid) => {
      calls.killTree.push(pid);
    },
    killOwnedListeners: () => {
      calls.killOwned += 1;
      return 0;
    },
    ...overrides.deps,
  };
  const manager = new DshManager(deps);
  const cleanup = () => fs.rmSync(workspace, { recursive: true, force: true });
  return {
    manager,
    spawned,
    calls,
    workspace,
    cleanup,
    setReachable: (value, announceReady = overrides.announceReady !== false) => {
      reachable = value;
      if (value && announceReady) {
        const child = spawned[spawned.length - 1];
        if (child) child.stdout.emit('data', Buffer.from(`dsh web: ${EXPECTED_URL}\n`));
      }
    },
    lastChild: () => spawned[spawned.length - 1],
  };
}

/** 给 promise 提前挂处理器，避免取消路径产生 unhandledRejection。 */
function settle(promise) {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );
}

test('正常启动：reachable 后进入 ready、清 failure、写 PID、返回 URL', async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  const states = [];
  let lastSnapshot = null;
  h.manager.on('state', (snapshot) => {
    states.push(snapshot.state);
    lastSnapshot = snapshot;
  });

  const p = h.manager.start();
  await waitFor(() => h.spawned.length === 1);
  h.setReachable(true);
  const url = await p;

  assert.equal(url, EXPECTED_URL);
  assert.equal(h.manager.state, 'ready');
  assert.equal(h.manager.baseUrl, EXPECTED_URL);
  assert.equal(h.manager.failure, null);
  assert.deepEqual(h.calls.writePid, [CHILD_PID]);
  assert.ok(states.includes('starting'));
  assert.ok(states.includes('ready'));
  // snapshot 保留现有字段并增加 failure
  assert.ok(lastSnapshot && typeof lastSnapshot === 'object');
  for (const key of ['state', 'error', 'baseUrl', 'attached', 'logs', 'failure']) {
    assert.ok(key in lastSnapshot, `snapshot 应包含 ${key}`);
  }
});

test('HTTP 探活单独不能标记 ready，必须等 dsh web 行', async (t) => {
  const h = makeHarness({ announceReady: false });
  t.after(h.cleanup);
  const outcome = settle(h.manager.start());
  await waitFor(() => h.spawned.length === 1);
  h.setReachable(true, false);
  await tick(20);
  assert.equal(h.manager.state, 'starting');
  h.lastChild().stdout.emit('data', Buffer.from(`dsh web: ${EXPECTED_URL}\n`));
  const result = await outcome;
  assert.equal(result.ok, true);
  assert.equal(h.manager.state, 'ready');
});

test('单飞：并发 start 只 spawn 一次；ready 后再 start 直接返回', async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);

  const p1 = h.manager.start();
  const p2 = h.manager.start();
  const p3 = h.manager.start();
  h.setReachable(true);
  const [u1, u2, u3] = await Promise.all([p1, p2, p3]);

  assert.equal(h.spawned.length, 1, '并发 start 应复用同一个 in-flight');
  assert.equal(u1, EXPECTED_URL);
  assert.equal(u2, EXPECTED_URL);
  assert.equal(u3, EXPECTED_URL);

  const u4 = await h.manager.start();
  assert.equal(u4, EXPECTED_URL);
  assert.equal(h.spawned.length, 1, 'ready 后再 start 不应重新 spawn');
});

test('运行期退出：结构化 failure phase=runtime，清 child 与 PID', async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  h.setReachable(true);
  await h.manager.start();

  const clearBefore = h.calls.clearPid;
  emitExit(h.lastChild(), 1, 'SIGTERM');

  assert.equal(h.manager.state, 'error');
  assert.equal(h.manager.child, null);
  assert.ok(h.manager.error.includes('code 1'));
  const failure = h.manager.failure;
  assert.ok(failure, '应记录结构化 failure');
  assert.equal(failure.phase, 'runtime');
  assert.equal(failure.code, 1);
  assert.equal(failure.signal, 'SIGTERM');
  assert.ok(failure.message.includes('code 1'));
  assert.equal(typeof failure.occurredAt, 'string');
  assert.ok(!Number.isNaN(Date.parse(failure.occurredAt)), 'occurredAt 应为合法时间戳');
  assert.ok(h.calls.clearPid > clearBefore, '当前 child 退出应清 PID');
});

test('spawn error 快速失败：保留真实错误对象、phase=startup、不等超时', async (t) => {
  const h = makeHarness({ childPid: null });
  t.after(h.cleanup);
  const spawnError = Object.assign(new Error('ENOENT：spawn node ENOENT'), { code: 'ENOENT' });

  const outcome = settle(h.manager.start());
  await waitFor(() => h.spawned.length === 1);
  const started = Date.now();
  h.lastChild().emit('error', spawnError);

  const result = await outcome;
  assert.equal(result.ok, false);
  assert.equal(result.error, spawnError, '应保留真实错误对象');
  assert.ok(Date.now() - started < 5000, '应快速失败而不是等 180 秒');
  assert.equal(h.manager.state, 'error');
  assert.equal(h.manager.failure.phase, 'startup');
  assert.equal(h.manager.failure.message, spawnError.message);
  assert.equal(h.manager.failure.code, null);
  assert.equal(h.manager.failure.signal, null);
  assert.deepEqual(h.calls.killTree, [], 'spawn 失败（无 pid）不应 killTree');
});

test('error + exit 双事件：首个事件定状态，迟到 exit 被忽略', async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  const spawnError = new Error('双事件错误');

  const outcome = settle(h.manager.start());
  await waitFor(() => h.spawned.length === 1);
  const child = h.lastChild();
  child.emit('error', spawnError);
  emitExit(child, 1); // 迟到的 exit

  const result = await outcome;
  assert.equal(result.ok, false);
  assert.equal(result.error, spawnError);
  assert.equal(h.manager.state, 'error');
  assert.equal(h.manager.child, null);
  assert.equal(h.manager.failure.phase, 'startup');
  assert.equal(h.manager.failure.message, '双事件错误');
});

test('启动期 exit 快速失败：phase=startup、保留退出码、清 PID', async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);

  const outcome = settle(h.manager.start());
  await waitFor(() => h.spawned.length === 1);
  const started = Date.now();
  emitExit(h.lastChild(), 3);

  const result = await outcome;
  assert.equal(result.ok, false);
  assert.ok(result.error.message.includes('code 3'));
  assert.ok(Date.now() - started < 5000, '启动期 exit 应快速失败而不是等 180 秒');
  assert.equal(h.manager.state, 'error');
  assert.equal(h.manager.failure.phase, 'startup');
  assert.equal(h.manager.failure.code, 3);
  assert.equal(h.manager.failure.signal, null);
  assert.ok(h.calls.clearPid >= 1, '启动期 exit 也应清 PID');
});

test('旧 child 迟到事件无效：generation 与身份校验', async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  h.setReachable(true);
  await h.manager.start(); // gen 1, child A
  const childA = h.lastChild();

  await h.manager.stop(); // 结束 gen 1
  await h.manager.start(); // gen 2, child B
  const childB = h.lastChild();
  assert.equal(h.manager.state, 'ready');

  const clearBefore = h.calls.clearPid;
  const killBefore = h.calls.killTree.length;
  emitExit(childA, 9, 'SIGKILL'); // 旧 child 迟到 exit
  childA.emit('error', new Error('旧错误')); // 旧 child 迟到 error

  assert.equal(h.manager.state, 'ready');
  assert.equal(h.manager.child, childB);
  assert.equal(h.manager.failure, null);
  assert.equal(h.manager.error, '');
  assert.equal(h.calls.clearPid, clearBefore, '旧 child 退出不应清 PID');
  assert.equal(h.calls.killTree.length, killBefore, '旧 child 事件不应触发 killTree');
  await tick(10);
  assert.equal(h.manager.state, 'ready', '旧事件不得影响新状态');
});

test('stop 取消 in-flight start：最后 idle，绝不被旧 catch 改 error，可重新启动', async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);

  const outcome = settle(h.manager.start()); // 永不 reachable 的 in-flight start
  await waitFor(() => h.spawned.length === 1);

  await h.manager.stop();

  const result = await outcome;
  assert.equal(result.ok, false);
  assert.equal(result.error && result.error.code, 'DSH_CANCELLED');
  assert.equal(h.manager.state, 'idle');
  assert.equal(h.manager.child, null);
  assert.equal(h.manager.failure, null);
  assert.deepEqual(h.calls.killTree, [CHILD_PID]);
  assert.equal(h.calls.killOwned, 1);
  assert.ok(h.calls.clearPid >= 1);

  // 旧 catch 不得在 stop 之后把状态翻回 error
  await tick(10);
  assert.equal(h.manager.state, 'idle');

  // 取消后可重新启动并正常 ready
  h.setReachable(true);
  const url = await h.manager.start();
  assert.equal(url, EXPECTED_URL);
  assert.equal(h.manager.state, 'ready');
  assert.equal(h.spawned.length, 2);
});

test('stop during runtime preparation cancels the stale generation before spawn', async (t) => {
  let releasePreparation;
  const h = makeHarness({
    deps: {
      ensurePackagedHarness: () => new Promise((resolve) => {
        releasePreparation = resolve;
      }),
    },
  });
  t.after(h.cleanup);

  const outcome = settle(h.manager.start());
  await waitFor(() => typeof releasePreparation === 'function');
  await h.manager.stop();
  releasePreparation();

  const result = await outcome;
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, 'DSH_CANCELLED');
  assert.equal(h.spawned.length, 0, '过期 generation 不得继续 spawn');
  assert.equal(h.manager.state, 'idle');
  assert.equal(h.manager.child, null);
});

test('start 与 stop 重叠不死锁：start 等待 stop 完成后新起一代', async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);

  const p1 = h.manager.start();
  await waitFor(() => h.spawned.length === 1);

  const stopPromise = h.manager.stop(); // 不 await，立即发起下一次 start
  const p2 = h.manager.start();
  h.setReachable(true);

  await Promise.race([
    Promise.allSettled([p1, p2, stopPromise]),
    tick(5000).then(() => {
      throw new Error('start/stop 重叠死锁');
    }),
  ]);

  assert.equal(h.manager.state, 'ready');
  assert.equal(h.spawned.length, 2);

  const [r1, r2, rStop] = await Promise.allSettled([p1, p2, stopPromise]);
  assert.equal(r1.status, 'rejected', '旧 start 应被取消');
  assert.equal(r1.reason && r1.reason.code, 'DSH_CANCELLED');
  assert.equal(r2.status, 'fulfilled', 'stop 之后的 start 应成功');
  assert.equal(r2.value, EXPECTED_URL);
  assert.equal(rStop.status, 'fulfilled');
});

test('正常 stop：stopping→idle、killTree/clearPid/killOwnedListeners 被调用、幂等', async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  h.setReachable(true);
  await h.manager.start();

  const states = [];
  h.manager.on('state', (snapshot) => states.push(snapshot.state));

  await h.manager.stop();
  assert.equal(h.manager.state, 'idle');
  assert.equal(h.manager.child, null);
  assert.deepEqual(h.calls.killTree, [CHILD_PID]);
  assert.equal(h.calls.killOwned, 1);
  assert.ok(h.calls.clearPid >= 1);
  assert.ok(states.includes('stopping'));
  assert.ok(states.includes('idle'));

  // 再次 stop 幂等，不抛错
  await h.manager.stop();
  assert.equal(h.manager.state, 'idle');
});

test('运行时失败后重新 start：新一次 ready 清除旧 failure', async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  h.setReachable(true);
  await h.manager.start();
  emitExit(h.lastChild(), 1);
  assert.equal(h.manager.failure.phase, 'runtime');

  await h.manager.stop();
  assert.equal(h.manager.state, 'idle');

  await h.manager.start();
  assert.equal(h.manager.state, 'ready');
  assert.equal(h.manager.failure, null, 'ready 应清除 failure');
  assert.equal(h.manager.baseUrl, EXPECTED_URL);
});

test('npx fallback pins @deepseek-ai/dsh to pin.npm', () => {
  const pin = readPin(path.join(__dirname, '..', '..'));
  const manager = new DshManager({
    sourceHarnessStatus: () => ({ present: false }),
    resolveDshBin: () => null,
    resolveNpx: () => 'npx',
    resolveNodeBin: () => process.execPath,
    readPin: () => pin,
  });
  const launch = manager.buildLaunch({ host: '127.0.0.1', port: 3080 });
  assert.equal(launch.kind, 'npx');
  assert.ok(launch.args.includes(`@deepseek-ai/dsh@${pin.npm}`));
  assert.equal(launch.args.includes('@deepseek-ai/dsh'), false);
  assert.equal(launch.args.some((arg) => String(arg).includes('@latest')), false);
});

test('launcher recovery flags stay before host and port', () => {
  const manager = new DshManager({
    sourceHarnessStatus: () => ({ present: false }),
    resolveDshBin: () => 'dsh',
    resolveNpx: () => 'npx',
    resolveNodeBin: () => process.execPath,
  });
  const launch = manager.buildLaunch({
    host: '127.0.0.1',
    port: 3080,
    skipUserPlugins: true,
    patchFiles: ['C:/desktop-install.yml'],
  });
  assert.deepEqual(launch.args, [
    'web', '--skip-user-plugins', '--patch', 'C:/desktop-install.yml',
    '--host', '127.0.0.1', '--port', '3080', '--no-open',
  ]);
});

test('every launch kind passes --no-open so dsh web does not open the OS browser', () => {
  const source = new DshManager({
    sourceHarnessStatus: () => ({
      present: true,
      installed: true,
      built: true,
      root: 'C:/harness',
      bin: 'C:/harness/apps/cli/lib/bin.js',
    }),
    resolveNodeBin: () => process.execPath,
    ensureGhosttyAssetsInHarness: () => ({ ok: true, roots: ['C:/harness'], detail: 'complete' }),
  });
  const sourceLaunch = source.buildLaunch({ host: '127.0.0.1', port: 3080 });
  assert.equal(sourceLaunch.kind, 'source');
  assert.equal(sourceLaunch.args.includes('--no-open'), true);

  const dsh = new DshManager({
    sourceHarnessStatus: () => ({ present: false }),
    resolveDshBin: () => 'dsh',
    resolveNpx: () => 'npx',
    resolveNodeBin: () => process.execPath,
  });
  const dshLaunch = dsh.buildLaunch({ host: '127.0.0.1', port: 3080 });
  assert.equal(dshLaunch.kind, 'dsh');
  assert.equal(dshLaunch.args.includes('--no-open'), true);

  const pin = readPin(path.join(__dirname, '..', '..'));
  const npx = new DshManager({
    sourceHarnessStatus: () => ({ present: false }),
    resolveDshBin: () => null,
    resolveNpx: () => 'npx',
    resolveNodeBin: () => process.execPath,
    readPin: () => pin,
  });
  const npxLaunch = npx.buildLaunch({ host: '127.0.0.1', port: 3080 });
  assert.equal(npxLaunch.kind, 'npx');
  assert.equal(npxLaunch.args.includes('--no-open'), true);
});

test('source launch copies Ghostty assets beside client.js', () => {
  let seen;
  const manager = new DshManager({
    sourceHarnessStatus: () => ({
      present: true,
      installed: true,
      built: true,
      root: 'C:/harness',
      bin: 'C:/harness/apps/cli/lib/bin.js',
    }),
    resolveNodeBin: () => process.execPath,
    ensureGhosttyAssetsInHarness: (root) => {
      seen = root;
      return { ok: true, roots: [root], detail: 'complete' };
    },
  });
  const launch = manager.buildLaunch({ host: '127.0.0.1', port: 3080 });
  assert.equal(launch.kind, 'source');
  assert.equal(seen, 'C:/harness');
});

test('source launch refuses when Ghostty assets are incomplete', () => {
  const manager = new DshManager({
    sourceHarnessStatus: () => ({
      present: true,
      installed: true,
      built: true,
      root: 'C:/harness',
      bin: 'C:/harness/apps/cli/lib/bin.js',
    }),
    resolveNodeBin: () => process.execPath,
    ensureGhosttyAssetsInHarness: () => ({ ok: false, roots: [], detail: 'missing source' }),
  });
  assert.throws(
    () => manager.buildLaunch({ host: '127.0.0.1', port: 3080 }),
    (error) => {
      assert.match(String(error.message), /Ghostty/);
      assert.match(String(error.message), /setup:harness/);
      assert.match(String(error.message), /missing source/);
      return true;
    },
  );
});

test('source launch refuses when harness root is missing', () => {
  const manager = new DshManager({
    sourceHarnessStatus: () => ({
      present: true,
      installed: true,
      built: true,
      bin: 'C:/harness/apps/cli/lib/bin.js',
    }),
    resolveNodeBin: () => process.execPath,
    ensureGhosttyAssetsInHarness: () => {
      throw new Error('ensure must not run without root');
    },
  });
  assert.throws(
    () => manager.buildLaunch({ host: '127.0.0.1', port: 3080 }),
    (error) => {
      assert.match(String(error.message), /Ghostty|setup:harness/);
      return true;
    },
  );
});

test('restart 不死锁：stop→start 完整往返，新 child 就绪', async (t) => {
  const h = makeHarness();
  t.after(h.cleanup);
  h.setReachable(true);
  await h.manager.start();
  const childA = h.lastChild();

  await h.manager.restart();

  assert.equal(h.manager.state, 'ready');
  assert.equal(h.spawned.length, 2);
  assert.notEqual(h.lastChild(), childA);
  assert.equal(h.manager.baseUrl, EXPECTED_URL);
});
