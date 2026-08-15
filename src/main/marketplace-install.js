const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { app } = require('electron');
const { loadConfig } = require('./config');
const { resolveNodeBin, sourceHarnessStatus } = require('./dsh');
const { projectRoot, harnessRoot } = require('./paths');
const { DROPPED, webProfileDir, PROFILE, listInstalledPlugins } = require('./plugins');
const { resolveCommitSha } = require('./marketplace-catalog');
const { parseAllowBuilds } = require('./marketplace-allowbuilds');
const { prependPath } = require('../shared/env-path');

const ALLOW_HINT = /ignored build scripts|allowbuilds|approve-builds|blocked.*prepare|pnpm-workspace\.yaml/i;

function whichAll(command) {
  try {
    const bin = process.platform === 'win32' ? 'where.exe' : 'which';
    const out = execFileSync(bin, [command], { encoding: 'utf8' });
    return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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

function resolvePnpmCjs() {
  return firstExisting([
    path.join(process.resourcesPath || '', 'pnpm', 'bin', 'pnpm.cjs'),
    path.join(projectRoot(), 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
    path.join(harnessRoot(), 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
  ]);
}

function resolvePnpmBin() {
  const fromPath = whichAll(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')[0]
    || whichAll('pnpm')[0];
  if (fromPath && fs.existsSync(fromPath)) {
    return fromPath;
  }
  return null;
}

function shimDir() {
  return path.join(app.getPath('userData'), 'bin');
}

function ensurePnpmShim(nodeBin) {
  const cjs = resolvePnpmCjs();
  if (!cjs || !nodeBin) {
    return resolvePnpmBin() ? path.dirname(resolvePnpmBin()) : null;
  }
  const dir = shimDir();
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform === 'win32') {
    const cmd = path.join(dir, 'pnpm.cmd');
    fs.writeFileSync(cmd, `@echo off\r\n"${nodeBin}" "${cjs}" %*\r\n`, 'utf8');
  } else {
    const sh = path.join(dir, 'pnpm');
    fs.writeFileSync(sh, `#!/bin/sh\nexec "${nodeBin}" "${cjs}" "$@"\n`, { encoding: 'utf8', mode: 0o755 });
  }
  return dir;
}

function pluginEnv(nodeBin) {
  const config = loadConfig();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  if (config.apiKey) {
    env.DEEPSEEK_API_KEY = config.apiKey;
  }
  env.npm_config_update_notifier = 'false';
  env.CI = env.CI || '1';
  const extras = [];
  const shim = ensurePnpmShim(nodeBin);
  if (shim) {
    extras.push(shim);
  }
  if (nodeBin) {
    extras.push(path.dirname(nodeBin));
  }
  if (process.env.APPDATA) {
    extras.push(path.join(process.env.APPDATA, 'npm'));
  }
  prependPath(env, extras);
  return env;
}

function workspaceYamlPath() {
  return path.join(webProfileDir(), 'pnpm-workspace.yaml');
}

function allowBuildsInWorkspace(keys) {
  const file = workspaceYamlPath();
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (!/allowBuilds\s*:/m.test(text)) {
    text = `${text.replace(/\s+$/, '')}${text ? '\n' : ''}allowBuilds:\n`;
  }
  for (const key of keys) {
    const quoted = /[:@/]/.test(key) ? JSON.stringify(key) : key;
    const pattern = new RegExp(`^\\s*${quoted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'm');
    if (pattern.test(text)) {
      continue;
    }
    text = text.replace(/allowBuilds\s*:\s*\n?/, `allowBuilds:\n  ${quoted}: true\n`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  fs.renameSync(tmp, file);
  return file;
}

function resolveCli() {
  const config = loadConfig();
  const nodeBin = resolveNodeBin(config);
  const source = sourceHarnessStatus();
  const binJs = path.join(harnessRoot(), 'apps', 'cli', 'lib', 'bin.js');
  if (!nodeBin) {
    return { ok: false, error: '未找到 Node.js。请安装 Node.js 22.19+ 或 24+。' };
  }
  if (!fs.existsSync(binJs) && !source.bin) {
    return { ok: false, error: '未找到 dsh CLI。请先运行 npm run setup:harness。' };
  }
  const cli = fs.existsSync(binJs) ? binJs : source.bin;
  if (!cli || !fs.existsSync(cli)) {
    return { ok: false, error: 'dsh CLI 未构建。请先运行 npm run setup:harness。' };
  }
  if (!resolvePnpmCjs() && !resolvePnpmBin()) {
    return { ok: false, error: '未找到 pnpm。安装包应已内置；开发时请在本机安装 pnpm。' };
  }
  return { ok: true, nodeBin, cli };
}

function runPlugin(args, onProgress) {
  const resolved = resolveCli();
  if (!resolved.ok) {
    return Promise.resolve({ ok: false, code: 127, log: resolved.error, needsAllowBuilds: false, allowBuilds: [] });
  }
  const env = pluginEnv(resolved.nodeBin);
  return new Promise((resolve) => {
    const child = spawn(resolved.nodeBin, [resolved.cli, 'plugin', '--profile', PROFILE, ...args], {
      cwd: os.homedir(),
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    const append = (chunk) => {
      const text = chunk.toString('utf8');
      log += text;
      if (typeof onProgress === 'function') {
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) {
            onProgress({ phase: 'log', line });
          }
        }
      }
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.on('error', (error) => {
      resolve({
        ok: false,
        code: 127,
        log: `${log}\n${error.message}`.trim(),
        needsAllowBuilds: false,
        allowBuilds: [],
      });
    });
    child.on('exit', (code) => {
      const allowBuilds = parseAllowBuilds(log);
      const needsAllowBuilds = code !== 0 && (ALLOW_HINT.test(log) || allowBuilds.length > 0);
      resolve({
        ok: code === 0,
        code: code ?? 1,
        log: log.trim(),
        needsAllowBuilds,
        allowBuilds,
      });
    });
  });
}

function parseGithubSpec(spec) {
  const match = /^github:([^/#]+)\/([^/#]+)(?:#(.+))?$/.exec(String(spec || '').trim());
  if (!match) {
    return null;
  }
  return { owner: match[1], repo: match[2], ref: match[3] || '' };
}

async function pinInstallSpec(spec, token) {
  const parsed = parseGithubSpec(spec);
  if (!parsed) {
    return spec;
  }
  if (parsed.ref && /^[0-9a-f]{7,40}$/i.test(parsed.ref)) {
    return spec;
  }
  const sha = await resolveCommitSha(parsed.owner, parsed.repo, parsed.ref || 'HEAD', token);
  return sha ? `github:${parsed.owner}/${parsed.repo}#${sha}` : spec;
}

async function installPlugin(spec, options = {}) {
  const name = String(spec || '').trim();
  if (!name) {
    return { ok: false, error: '缺少安装规格' };
  }
  if (DROPPED.includes(name) || DROPPED.some((item) => name.includes(item))) {
    return { ok: false, error: '该插件已退役，不再提供安装' };
  }
  if (typeof options.onProgress === 'function') {
    options.onProgress({ phase: 'start', line: `正在安装 ${name}` });
  }
  const pinned = await pinInstallSpec(name, options.token);
  if (options.allowBuilds?.length) {
    allowBuildsInWorkspace(options.allowBuilds);
  }
  const result = await runPlugin(['add', pinned], options.onProgress);
  if (result.ok) {
    return { ...result, spec: pinned, installed: listInstalledPlugins() };
  }
  return { ...result, spec: pinned, error: result.needsAllowBuilds ? '需要允许该插件在本机执行构建脚本' : '安装失败' };
}

async function uninstallPlugin(packageName, options = {}) {
  const name = String(packageName || '').trim();
  if (!name) {
    return { ok: false, error: '缺少包名' };
  }
  if (typeof options.onProgress === 'function') {
    options.onProgress({ phase: 'start', line: `正在卸载 ${name}` });
  }
  const result = await runPlugin(['remove', name], options.onProgress);
  if (result.ok) {
    return { ...result, installed: listInstalledPlugins() };
  }
  return { ...result, error: '卸载失败' };
}

module.exports = {
  listInstalledPlugins,
  parseAllowBuilds,
  allowBuildsInWorkspace,
  installPlugin,
  uninstallPlugin,
  resolveCli,
};
