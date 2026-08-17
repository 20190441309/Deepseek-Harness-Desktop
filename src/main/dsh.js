const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const EventEmitter = require('events');
const { loadConfig, configPath } = require('./config');
const { harnessRoot } = require('./paths');
const { ensurePackagedHarness, harnessArchivePath } = require('./harness-extract');
const { prependPath } = require('../shared/env-path');
const { desktopInstallEnv } = require('./desktop-install-control');

const PORT_SCAN_RANGE = 50;

const READY_TIMEOUT_MS = 180_000;
const LOG_LIMIT = 400;

function whichAll(command) {
  try {
    const bin = process.platform === 'win32' ? 'where.exe' : 'which';
    const out = execFileSync(bin, [command], { encoding: 'utf8' });
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function isUsableNode(bin) {
  if (!bin || !fs.existsSync(bin)) {
    return false;
  }
  const normalized = path.normalize(bin);
  if (/electron/i.test(normalized)) {
    return false;
  }
  if (process.execPath && path.normalize(process.execPath) === normalized) {
    return false;
  }
  return true;
}

function bundledNodeBin() {
  try {
    const { app } = require('electron');
    if (!app.isPackaged) {
      return null;
    }
    return firstExisting([
      path.join(process.resourcesPath, 'node.exe'),
      path.join(process.resourcesPath, 'node'),
    ]);
  } catch {
    return null;
  }
}

function resolveNodeBin(config) {
  if (isUsableNode(config.nodeBin)) {
    return config.nodeBin;
  }
  const bundled = bundledNodeBin();
  if (isUsableNode(bundled)) {
    return bundled;
  }
  const preferred = firstExisting([
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
  ]);
  if (preferred) {
    return preferred;
  }
  const fromPath = whichAll(process.platform === 'win32' ? 'node.exe' : 'node')
    .concat(whichAll('node'))
    .find(isUsableNode);
  return fromPath || null;
}

function resolveNpx(nodeBin) {
  if (!nodeBin) {
    return null;
  }
  const dir = path.dirname(nodeBin);
  const npx = firstExisting([
    path.join(dir, 'npx.cmd'),
    path.join(dir, 'npx'),
    path.join(dir, 'npx.exe'),
  ]);
  return npx;
}

function resolveDshBin(config) {
  const source = sourceHarnessStatus();
  if (source.present) {
    return source.bin;
  }
  if (config.dshBin && fs.existsSync(config.dshBin)) {
    return config.dshBin;
  }
  const npmGlobal = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm', process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
    : null;
  const fromPath = whichAll(process.platform === 'win32' ? 'dsh.cmd' : 'dsh')[0]
    || whichAll('dsh')[0];
  return firstExisting([fromPath, npmGlobal]);
}

function sourceHarnessStatus() {
  const root = harnessRoot();
  const binJs = path.join(root, 'apps', 'cli', 'lib', 'bin.js');
  const binTs = path.join(root, 'apps', 'cli', 'src', 'bin.ts');
  const webDist = path.join(root, 'apps', 'web', 'dist', 'index.html');
  const builtOnDisk = fs.existsSync(binJs) && fs.existsSync(webDist);
  let archived = false;
  try {
    const { app } = require('electron');
    archived = Boolean(app.isPackaged && fs.existsSync(harnessArchivePath()));
  } catch {
    // app not ready
  }
  return {
    root,
    present: fs.existsSync(binTs) || fs.existsSync(binJs) || archived,
    installed: fs.existsSync(path.join(root, 'node_modules')) || archived,
    built: builtOnDisk || archived,
    bin: fs.existsSync(binJs) ? binJs : binTs,
  };
}

function execTimed(command, args, timeoutMs = 2500) {
  try {
    return execFileSync(command, args, {
      timeout: timeoutMs,
      windowsHide: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    return error && error.stdout ? String(error.stdout) : '';
  }
}

function isSelfPid(pid) {
  return pid === process.pid || pid === process.ppid;
}

function isSafeToKill(pid) {
  if (!pid || isSelfPid(pid)) {
    return false;
  }
  const name = processImageName(pid).toLowerCase();
  if (!name || name.includes('electron')) {
    return false;
  }
  return /^(node|dsh)(\.exe)?$/.test(name);
}

function killTree(pid) {
  if (!pid || !isSafeToKill(pid)) {
    return;
  }
  try {
    if (process.platform === 'win32') {
      execTimed('taskkill', ['/pid', String(pid), '/T', '/F'], 2500);
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}

function pidFilePath() {
  try {
    return path.join(path.dirname(configPath()), 'dshd-web.pid');
  } catch {
    return null;
  }
}

function readPidFile() {
  const file = pidFilePath();
  if (!file || !fs.existsSync(file)) {
    return null;
  }
  const pid = Number(fs.readFileSync(file, 'utf8').trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function writePidFile(pid) {
  const file = pidFilePath();
  if (!file || !pid) {
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, String(pid), 'utf8');
}

function clearPidFile() {
  const file = pidFilePath();
  if (file && fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
    } catch {
      // ignore
    }
  }
}

function processAlive(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processImageName(pid) {
  try {
    if (process.platform === 'win32') {
      const out = execTimed('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], 2000).trim();
      const match = out.match(/^"([^"]+)"/);
      return match ? match[1] : '';
    }
    return execTimed('ps', ['-p', String(pid), '-o', 'comm='], 2000).trim();
  } catch {
    return '';
  }
}

function listeningPids(port) {
  const wanted = Number(port);
  if (!wanted) {
    return [];
  }
  try {
    const out = process.platform === 'win32'
      ? execTimed('netstat', ['-ano'], 2500)
      : execTimed('lsof', ['-nP', `-iTCP:${wanted}`, '-sTCP:LISTEN', '-t'], 2500);
    if (process.platform !== 'win32') {
      return [...new Set(out.split(/\s+/).map(Number).filter((pid) => pid > 0))];
    }
    const pids = new Set();
    for (const raw of out.split(/\r?\n/)) {
      const line = raw.trim();
      if (!/LISTENING/i.test(line)) {
        continue;
      }
      const parts = line.split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      const local = parts[1] || '';
      const localPort = local.startsWith('[')
        ? local.slice(local.lastIndexOf(']:') + 2)
        : local.split(':').pop();
      if (pid > 0 && Number(localPort) === wanted) {
        pids.add(pid);
      }
    }
    return [...pids];
  } catch {
    return [];
  }
}

function killOwnedListeners(port) {
  const self = process.pid;
  let killed = 0;
  for (const pid of listeningPids(port)) {
    if (isSelfPid(pid) || pid === self) {
      continue;
    }
    if (!isSafeToKill(pid)) {
      continue;
    }
    killTree(pid);
    killed += 1;
  }
  return killed;
}

function quoteWindowsCommand(command) {
  const value = String(command).trim();
  if (!value) {
    return command;
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    return value;
  }
  if (/[\s&()^<>|]/.test(value)) {
    return `"${value.replace(/"/g, '')}"`;
  }
  return value;
}

function spawnHarness(command, args, options) {
  const isWin = process.platform === 'win32';
  const needsShell = isWin && /\.(cmd|bat)$/i.test(command);
  return spawn(needsShell ? quoteWindowsCommand(command) : command, args, {
    ...options,
    windowsHide: true,
    shell: needsShell,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortInUse(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (used) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(used);
    };
    socket.setTimeout(400, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function findFreePort(host, startPort) {
  const begin = Number(startPort) || 3080;
  for (let port = begin; port < begin + PORT_SCAN_RANGE; port += 1) {
    if (!(await isPortInUse(host, port))) {
      return port;
    }
  }
  throw new Error(`从 ${begin} 起连续 ${PORT_SCAN_RANGE} 个端口都被占用`);
}

async function probePort(host, port) {
  const inUse = await isPortInUse(host, port);
  if (!inUse) {
    return { host, port, inUse: false, httpReady: false };
  }
  const baseUrl = `http://${host}:${port}`;
  let httpReady = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    const response = await fetch(baseUrl, { signal: controller.signal });
    clearTimeout(timer);
    httpReady = response.ok;
  } catch {
    httpReady = false;
  }
  return { host, port, inUse: true, httpReady, baseUrl };
}

/**
 * Make `port` ours for this GUI process: stop a leftover dsh/node listener,
 * or hop to the next free port if something else is bound there.
 */
async function ensureOwnedPort(host, wantedPort, log = () => {}) {
  const wanted = Number(wantedPort) || 3080;
  let probe = await probePort(host, wanted);
  if (!probe.inUse) {
    clearPidFile();
    log(`端口 ${wanted} 空闲`);
    return wanted;
  }

  const previous = readPidFile();
  if (previous && processAlive(previous) && isSafeToKill(previous)) {
    log(`停止上次残留的 dsh（pid ${previous}）`);
    killTree(previous);
    await sleep(400);
    probe = await probePort(host, wanted);
    if (!probe.inUse) {
      clearPidFile();
      return wanted;
    }
  }
  clearPidFile();

  if (probe.httpReady) {
    const killed = killOwnedListeners(wanted);
    if (killed) {
      log(`已结束占用 ${wanted} 的残留服务（${killed} 个进程）`);
      await sleep(400);
      probe = await probePort(host, wanted);
      if (!probe.inUse) {
        return wanted;
      }
    }
  }

  const next = await findFreePort(host, wanted + 1);
  log(`端口 ${wanted} 仍被其他程序占用，改用 ${next}`);
  return next;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function cancelledError(message = '启动已取消') {
  const error = new Error(message);
  error.code = 'DSH_CANCELLED';
  return error;
}

function failureRecord(phase, message, code, signal) {
  return {
    phase,
    message,
    code: code === undefined || code === null ? null : code,
    signal: signal || null,
    occurredAt: new Date().toISOString(),
  };
}

class DshManager extends EventEmitter {
  /**
   * @param {object} [options] 窄依赖注入；不传任何选项时全部使用生产默认实现。
   *   可注入：loadConfig、ensurePackagedHarness、spawnHarness、isReachable、
   *   sleep、readPidFile、writePidFile、clearPidFile、killTree、killOwnedListeners、
   *   buildLaunch（测试需要绕过 electron 依赖时按需注入）。
   */
  constructor(options = {}) {
    super();
    this.child = null;
    this.state = 'idle';
    this.logs = [];
    this.error = '';
    this.failure = null;
    this.baseUrl = '';
    this.attached = false;
    this.host = '127.0.0.1';
    this.port = 3080;
    this.generation = 0;
    this.inFlight = null;
    this._stopPromise = null;
    this._deps = {
      loadConfig: options.loadConfig || loadConfig,
      ensurePackagedHarness: options.ensurePackagedHarness || ensurePackagedHarness,
      spawnHarness: options.spawnHarness || spawnHarness,
      isReachable: options.isReachable || ((url) => this.isReachable(url)),
      sleep: options.sleep || sleep,
      readPidFile: options.readPidFile || readPidFile,
      writePidFile: options.writePidFile || writePidFile,
      clearPidFile: options.clearPidFile || clearPidFile,
      killTree: options.killTree || killTree,
      killOwnedListeners: options.killOwnedListeners || killOwnedListeners,
      buildLaunch: options.buildLaunch || ((config) => this.buildLaunch(config)),
    };
  }

  snapshot() {
    return {
      state: this.state,
      error: this.error,
      baseUrl: this.baseUrl,
      attached: this.attached,
      logs: this.logs.slice(-80),
      failure: this.failure,
    };
  }

  setState(state, extra = {}) {
    this.state = state;
    if (extra.error !== undefined) {
      this.error = extra.error;
    }
    if (extra.baseUrl !== undefined) {
      this.baseUrl = extra.baseUrl;
    }
    if (extra.attached !== undefined) {
      this.attached = extra.attached;
    }
    if (extra.failure !== undefined) {
      this.failure = extra.failure;
    }
    this.emit('state', this.snapshot());
  }

  log(line, source = 'app') {
    const text = String(line).replace(/\s+$/, '');
    if (!text) {
      return;
    }
    const entry = `[${source}] ${text}`;
    this.logs.push(entry);
    if (this.logs.length > LOG_LIMIT) {
      this.logs.splice(0, this.logs.length - LOG_LIMIT);
    }
    this.emit('log', entry);
  }

  async isReachable(baseUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const response = await fetch(baseUrl, { signal: controller.signal });
      clearTimeout(timer);
      return response.ok;
    } catch {
      return false;
    }
  }

  buildLaunch(config) {
    const host = config.host || '127.0.0.1';
    const port = Number(config.port) || 3080;
    const workspace = config.workspace;
    const nodeBin = resolveNodeBin(config);
    const npxBin = resolveNpx(nodeBin);
    const source = sourceHarnessStatus();
    const args = ['web', '--host', host, '--port', String(port)];

    if (source.present) {
      if (!source.installed || !source.built) {
        throw new Error(
          `已集成官方源码（vendor/deepseek-harness），但还没安装依赖或构建。请运行 npm run setup:harness`,
        );
      }
      if (!nodeBin) {
        throw new Error('未找到 Node.js。请安装 Node.js 22.19+ 或 24+。');
      }
      return {
        command: nodeBin,
        args: [source.bin, ...args],
        nodeBin,
        kind: 'source',
        host,
        port,
        workspace,
      };
    }

    const dshBin = resolveDshBin(config);
    if (dshBin) {
      return {
        command: dshBin,
        args,
        nodeBin,
        kind: 'dsh',
        host,
        port,
        workspace,
      };
    }

    if (!npxBin) {
      throw new Error('未找到 Node.js / npx。请安装 Node.js 18+ 并确保 npx 在 PATH 中。');
    }

    return {
      command: npxBin,
      args: ['--yes', '@deepseek-ai/dsh', 'web', '--host', host, '--port', String(port)],
      nodeBin,
      kind: 'npx',
      host,
      port,
      workspace,
    };
  }

  spawnEnv(config, nodeBin) {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.ELECTRON_NO_ASAR;
    if (config.apiKey) {
      env.DEEPSEEK_API_KEY = config.apiKey;
    }
    if (config.baseUrl) {
      env.DEEPSEEK_BASE_URL = config.baseUrl;
    }
    env.npm_config_update_notifier = 'false';
    env.npm_config_yes = 'true';
    const extras = [];
    if (process.env.APPDATA) {
      extras.push(path.join(process.env.APPDATA, 'npm'));
    }
    if (nodeBin) {
      extras.push(path.dirname(nodeBin));
    }
    try {
      const root = harnessRoot();
      extras.push(path.join(root, 'node_modules', '.bin'));
      env.DSH_HARNESS_ROOT = root;
    } catch {
      // app not ready
    }
    prependPath(env, extras);
    Object.assign(env, desktopInstallEnv());
    return env;
  }

  attachOutput(child) {
    const onChunk = (chunk, source) => {
      const text = chunk.toString('utf8');
      for (const line of text.split(/\r?\n/)) {
        this.log(line, source);
        const match = line.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/i);
        if (match) {
          this.baseUrl = match[0].replace(/\/$/, '');
        }
      }
    };
    child.stdout?.on('data', (chunk) => onChunk(chunk, 'dsh'));
    child.stderr?.on('data', (chunk) => onChunk(chunk, 'dsh'));
  }

  /**
   * 单飞入口：已有 in-flight start 时直接复用；ready 且子进程存活时直接返回。
   */
  async start(options = {}) {
    if (this.inFlight) {
      return this.inFlight;
    }
    if (this.state === 'ready' && this.child && this.child.exitCode === null) {
      return this.baseUrl;
    }
    const run = this._start(options);
    this.inFlight = run;
    try {
      return await run;
    } finally {
      if (this.inFlight === run) {
        this.inFlight = null;
      }
    }
  }

  async _start(options = {}) {
    if (this._stopPromise) {
      // 与 stop 重叠：等 stop 收尾后再启动，避免互相踩踏
      await this._stopPromise;
    }
    const gen = ++this.generation;
    const isCurrent = () => gen === this.generation;

    if (this.child) {
      const leftover = this.child.pid;
      this.log(`清理残留 dsh 进程（pid ${leftover}）`);
      this.child = null;
      this._killTree(leftover);
      await this._sleep(300);
      if (!isCurrent()) {
        throw cancelledError();
      }
    }

    const config = this._loadConfig();
    if (!config.workspace || !fs.existsSync(config.workspace)) {
      throw new Error(`工作区不存在：${config.workspace || '(空)'}`);
    }

    try {
      await this._ensurePackagedHarness((line) => this.log(line));
      if (!isCurrent()) {
        throw cancelledError();
      }
    } catch (error) {
      if (!isCurrent()) {
        throw cancelledError();
      }
      if (error?.code === 'DSH_CANCELLED') {
        throw error;
      }
      throw new Error(`准备运行时失败：${error.message}`);
    }

    const port = Number(options.port) || Number(config.port) || 3080;
    const launch = this._buildLaunch({ ...config, port });
    const expectedUrl = `http://${launch.host}:${launch.port}`;
    this.host = launch.host;
    this.port = launch.port;
    this.error = '';
    this.attached = false;
    this.setState('starting', { baseUrl: expectedUrl, attached: false, failure: null });
    this.log(`工作区 ${config.workspace}`);
    this.log(`启动本机服务 ${expectedUrl}`);

    if (launch.kind === 'source') {
      this.log(`从官方源码启动 ${launch.args[0]}`);
    } else if (launch.kind === 'dsh') {
      this.log(`启动 ${launch.command}`);
    } else {
      this.log('通过 npx 启动 @deepseek-ai/dsh（首次会下载运行时）');
    }

    const readiness = deferred();
    let child = null;
    try {
      child = this._spawnHarness(launch.command, launch.args, {
        cwd: config.workspace,
        env: this.spawnEnv(config, launch.nodeBin),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child = child;
      this.attachOutput(child);
      this._writePidFile(child.pid);

      child.on('error', (error) => this._onChildError(gen, child, error, readiness));
      child.on('exit', (code, signal) => this._onChildExit(gen, child, code, signal, readiness));

      this.waitUntilReady(expectedUrl, child, gen).then(
        (url) => readiness.resolve(url),
        (error) => readiness.reject(error),
      );

      const url = await readiness.promise;
      if (!isCurrent()) {
        throw cancelledError();
      }
      this.setState('ready', { baseUrl: url, attached: false, failure: null });
      this.log(`Web UI 就绪 ${url}`);
      return url;
    } catch (error) {
      if (!isCurrent()) {
        const stalePid = child?.pid;
        if (stalePid && this.child === child) {
          this.child = null;
          this._clearPidFile();
          this._killTree(stalePid);
        }
        // 本代已被 stop/restart 取消：状态由 stop 收尾为 idle，这里绝不改写
        throw error;
      }
      const pid = (child || this.child)?.pid;
      this.child = null;
      this._clearPidFile();
      if (!this.failure) {
        const message = error && error.message ? error.message : String(error);
        this.error = message;
        this.log(message, 'error');
        this.setState('error', {
          error: message,
          failure: failureRecord('startup', message, null, null),
        });
      }
      if (pid) {
        this._killTree(pid);
      }
      throw error;
    }
  }

  /** 当前代 child 的 error 事件：立即失败，保留真实错误，不等超时。 */
  _onChildError(gen, child, error, readiness) {
    if (gen !== this.generation || this.child !== child) {
      return; // 旧 child 或已失效 generation 的事件，一律无效
    }
    const message = error && error.message ? error.message : String(error);
    this.child = null;
    this._clearPidFile();
    this.error = message;
    this.log(message, 'error');
    const phase = this.state === 'ready' ? 'runtime' : 'startup';
    const failure = failureRecord(phase, message, null, null);
    this.setState('error', { error: message, failure });
    readiness.reject(error instanceof Error ? error : new Error(message));
  }

  /** 当前代 child 的 exit 事件：就绪前立即失败；就绪后记录 runtime failure；同时清 PID。 */
  _onChildExit(gen, child, code, signal, readiness) {
    if (gen !== this.generation || this.child !== child) {
      return; // 旧 child 或已失效 generation 的事件，一律无效
    }
    this.child = null;
    this._clearPidFile();
    if (this.state === 'stopping' || this.state === 'idle') {
      return; // stop 主动结束，状态由 stop() 收尾
    }
    const message = `dsh 进程结束（code ${code ?? 'null'}, signal ${signal || 'none'}）`;
    const phase = this.state === 'ready' ? 'runtime' : 'startup';
    const failure = failureRecord(phase, message, code, signal);
    this.error = message;
    this.log(message, 'error');
    this.setState('error', { error: message, failure });
    if (phase === 'startup') {
      readiness.reject(new Error(message));
    }
  }

  /**
   * 就绪轮询：每一轮都校验 generation 与 child 身份；被 stop 取消时抛 DSH_CANCELLED。
   * 启动期失败由 error/exit 处理器即时 reject readiness，这里负责正常就绪与超时。
   */
  async waitUntilReady(baseUrl, child, gen) {
    const started = Date.now();
    while (true) {
      if (gen !== this.generation || this.child !== child) {
        throw cancelledError();
      }
      if (child.exitCode !== null) {
        throw new Error(this.error || `dsh 已退出（code ${child.exitCode}）`);
      }
      const target = this.baseUrl || baseUrl;
      if (await this._isReachable(target)) {
        this.baseUrl = target;
        return target;
      }
      if (Date.now() - started >= READY_TIMEOUT_MS) {
        throw new Error('启动超时。若本机已安装 dsh，检查端口占用；否则确认 npx 能运行 @deepseek-ai/dsh。');
      }
      await this._sleep(400);
    }
  }

  async stop() {
    if (this._stopPromise) {
      return this._stopPromise;
    }
    const run = this._doStop();
    this._stopPromise = run;
    try {
      await run;
    } finally {
      if (this._stopPromise === run) {
        this._stopPromise = null;
      }
    }
  }

  async _doStop() {
    this.generation += 1; // 使 in-flight start 与旧 child 事件全部失效
    this.inFlight = null; // 下一次 start 从全新代开始
    this.attached = false;
    const child = this.child;
    const pid = child?.pid || this._readPidFile();
    // Drop the live child before SIGTERM/killTree so a cancelled start catch
    // cannot also killTree the same pid during the non-Windows grace sleep.
    this.child = null;
    if (pid) {
      this.setState('stopping');
      this.log(`停止 dsh（pid ${pid}）`);
      if (child && process.platform !== 'win32') {
        try {
          child.kill('SIGTERM');
        } catch {
          // ignore
        }
        await this._sleep(800);
      }
      this._killTree(pid);
    }
    this._clearPidFile();
    const leftover = this._killOwnedListeners(this.port);
    if (leftover) {
      this.log(`已清理端口 ${this.port} 上的残留进程`);
      await this._sleep(300);
    }
    if (this.state !== 'idle') {
      this.setState('idle');
    }
  }

  async restart() {
    await this.stop();
    await this._sleep(300);
    return this.start();
  }

  // 依赖访问器（默认即生产实现，测试可注入）
  _loadConfig() {
    return this._deps.loadConfig();
  }

  _ensurePackagedHarness(log) {
    return this._deps.ensurePackagedHarness(log);
  }

  _spawnHarness(command, args, options) {
    return this._deps.spawnHarness(command, args, options);
  }

  _isReachable(url) {
    return this._deps.isReachable(url);
  }

  _sleep(ms) {
    return this._deps.sleep(ms);
  }

  _readPidFile() {
    return this._deps.readPidFile();
  }

  _writePidFile(pid) {
    return this._deps.writePidFile(pid);
  }

  _clearPidFile() {
    return this._deps.clearPidFile();
  }

  _killTree(pid) {
    return this._deps.killTree(pid);
  }

  _killOwnedListeners(port) {
    return this._deps.killOwnedListeners(port);
  }

  _buildLaunch(config) {
    return this._deps.buildLaunch(config);
  }
}

module.exports = {
  DshManager,
  resolveNodeBin,
  resolveDshBin,
  sourceHarnessStatus,
  probePort,
  findFreePort,
  ensureOwnedPort,
};
