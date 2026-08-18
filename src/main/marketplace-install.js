const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { app } = require('electron');
const { loadConfig } = require('./config');
const { resolveNodeBin, sourceHarnessStatus } = require('./dsh');
const { projectRoot, harnessRoot } = require('./paths');
const { DROPPED, webProfileDir, PROFILE, listInstalledPlugins } = require('./plugins');
const { resolveCommitSha, getMarketplacePlugin } = require('./marketplace-catalog');
const { parseAllowBuilds } = require('./marketplace-allowbuilds');
const {
  isValidGithubSpec,
  isValidPackageName,
  normalizeAllowBuilds,
} = require('../host/install-dsh-plugin-client');
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
  const normalized = normalizeAllowBuilds(keys);
  if (!normalized) {
    throw new Error('allowBuilds contains an invalid package key');
  }
  const file = workspaceYamlPath();
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (!/allowBuilds\s*:/m.test(text)) {
    text = `${text.replace(/\s+$/, '')}${text ? '\n' : ''}allowBuilds:\n`;
  }
  for (const key of normalized) {
    const quoted = JSON.stringify(key);
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

const BUSY_ERROR = '已有插件正在安装或卸载，请稍后再试';
const GITHUB_PATH_SPEC = /^github:([^/#]+)\/([^/#]+)#path:\/(.+)$/;
const GITHUB_URL_OWNER_REPO = /github\.com\/([^/#]+)\/([^/#]+)/i;

let pluginLock = false;

function pluginCommand(options) {
  return typeof options.runPlugin === 'function' ? options.runPlugin : runPlugin;
}

async function withPluginLock(work) {
  if (pluginLock) {
    return { ok: false, error: BUSY_ERROR };
  }
  pluginLock = true;
  try {
    return await work();
  } finally {
    pluginLock = false;
  }
}

function parseGithubSpec(spec) {
  const value = String(spec || '').trim();
  if (!isValidGithubSpec(value)) {
    return null;
  }
  const match = /^github:([^/#]+)\/([^/#]+)(?:#(.+))?$/.exec(value);
  if (!match) {
    return null;
  }
  return { owner: match[1], repo: match[2], ref: match[3] || '' };
}

function githubOwnerRepoFromHomepage(url) {
  const match = String(url || '').match(GITHUB_URL_OWNER_REPO);
  if (!match) {
    return null;
  }
  return { owner: match[1], repo: String(match[2]).replace(/\.git$/i, '') };
}

function ownerRepoMatches(owner, repo, homepage) {
  const fromUrl = githubOwnerRepoFromHomepage(homepage);
  return Boolean(fromUrl && fromUrl.owner === owner && fromUrl.repo === repo);
}

function isValidMarketplacePathSpec(spec, plugin) {
  const match = GITHUB_PATH_SPEC.exec(spec);
  if (!match) {
    return false;
  }
  const posix = match[3];
  if (!posix || posix.includes('..') || posix.includes(':') || posix.includes('\\')) {
    return false;
  }
  return ownerRepoMatches(match[1], match[2], plugin.homepage);
}

function isAllowedMarketplaceSpec(spec, plugin) {
  if (!spec || spec.startsWith('file:') || spec.startsWith('link:')) {
    return false;
  }
  if (/^(?:https?:|git\+|git:)/i.test(spec)) {
    return false;
  }
  if (spec.includes('#path:')) {
    return isValidMarketplacePathSpec(spec, plugin);
  }
  if (spec.startsWith('github:')) {
    const parsed = parseGithubSpec(spec);
    return Boolean(parsed && ownerRepoMatches(parsed.owner, parsed.repo, plugin.homepage));
  }
  if (!isValidPackageName(spec)) {
    return false;
  }
  return plugin.npm ? spec === plugin.npm : true;
}

function isDroppedInstall(plugin, spec) {
  return DROPPED.includes(plugin.id)
    || DROPPED.includes(plugin.packageName)
    || (isValidPackageName(spec) && DROPPED.includes(spec));
}

function packageInstallDir(packageName) {
  return path.join(webProfileDir(), 'node_modules', packageName);
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // Missing files and invalid JSON are unread, not fatal.
    return null;
  }
}

function resolveExportFile(pkg, dir, key) {
  const exp = pkg.exports;
  if (typeof exp === 'string') {
    return key === '.' ? path.resolve(dir, exp) : null;
  }
  if (!exp || typeof exp !== 'object') {
    return null;
  }
  const entry = exp[key];
  if (typeof entry === 'string') {
    return path.resolve(dir, entry);
  }
  if (entry && typeof entry === 'object') {
    const rel = entry.default || entry.import || entry.require;
    return typeof rel === 'string' ? path.resolve(dir, rel) : null;
  }
  return null;
}

function isExistingFile(file) {
  try {
    return Boolean(file) && fs.statSync(file).isFile();
  } catch {
    // Absent paths are not loadable entries.
    return false;
  }
}

function hasLoadableEntry(packageName) {
  const dir = packageInstallDir(packageName);
  const pkg = readJsonFile(path.join(dir, 'package.json'));
  if (!pkg || typeof pkg !== 'object') {
    return false;
  }
  if (pkg.dsh?.bundle?.patch) {
    return true;
  }
  const client = pkg.dsh?.client;
  if (typeof client === 'string' && isExistingFile(path.resolve(dir, client))) {
    return true;
  }
  if (client && typeof client === 'object' && isExistingFile(resolveExportFile(pkg, dir, './client'))) {
    return true;
  }
  if (typeof pkg.main === 'string' && isExistingFile(path.resolve(dir, pkg.main))) {
    return true;
  }
  return isExistingFile(resolveExportFile(pkg, dir, '.'));
}

function pluginNames(installed) {
  return (installed?.plugins || []).map((row) => row.name).filter(Boolean);
}

function namesAddedByInstall(before, after) {
  const previous = new Set(pluginNames(before));
  return pluginNames(after).filter((name) => !previous.has(name));
}

function resolveInstalledNames(spec, before, after) {
  const names = namesAddedByInstall(before, after);
  if (names.length > 0) {
    return names;
  }
  return isValidPackageName(spec) ? [spec] : [];
}

function loadableInstallFailure(added) {
  return {
    ok: false,
    spec: added.spec,
    error: '该包不是可加载的 dsh 插件',
    needsAllowBuilds: false,
    allowBuilds: [],
    log: added.log || '',
  };
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

function failedInstall(result, pinned) {
  return {
    ...result,
    spec: pinned,
    error: result.needsAllowBuilds ? '需要允许该插件在本机执行构建脚本' : '安装失败',
  };
}

async function addPluginSpec(spec, options) {
  const allowBuilds = normalizeAllowBuilds(options.allowBuilds);
  if (!allowBuilds) {
    return { ok: false, error: 'allowBuilds 包含非法包名' };
  }
  if (typeof options.onProgress === 'function') {
    options.onProgress({ phase: 'start', line: `正在安装 ${spec}` });
  }
  const pinned = await pinInstallSpec(spec, options.token);
  if (allowBuilds.length) {
    allowBuildsInWorkspace(allowBuilds);
  }
  const result = await pluginCommand(options)(['add', pinned], options.onProgress);
  if (result.ok) {
    return { ...result, spec: pinned, installed: listInstalledPlugins() };
  }
  return failedInstall(result, pinned);
}

async function installPlugin(spec, options = {}) {
  const name = String(spec || '').trim();
  if (!name) {
    return { ok: false, error: '缺少安装规格' };
  }
  return withPluginLock(async () => {
    if (!isValidGithubSpec(name)) {
      return { ok: false, error: '仅支持 github:owner/repo[#ref] 安装规格' };
    }
    if (DROPPED.includes(name) || DROPPED.some((item) => name.includes(item))) {
      return { ok: false, error: '该插件已退役，不再提供安装' };
    }
    return addPluginSpec(name, options);
  });
}

async function uninstallPlugin(packageName, options = {}) {
  const name = String(packageName || '').trim();
  if (!name) {
    return { ok: false, error: '缺少包名' };
  }
  return withPluginLock(async () => {
    if (!isValidPackageName(name)) {
      return { ok: false, error: '包名格式非法' };
    }
    if (typeof options.onProgress === 'function') {
      options.onProgress({ phase: 'start', line: `正在卸载 ${name}` });
    }
    const result = await pluginCommand(options)(['remove', name], options.onProgress);
    if (result.ok) {
      return { ...result, installed: listInstalledPlugins() };
    }
    return { ...result, error: '卸载失败' };
  });
}

/**
 * Install a curated marketplace plugin by catalog id.
 * The CLI only receives that row's installSpec after marketplace validation.
 * @param {string} id - registry `owner/name` id.
 * @param {{ allowBuilds?: string[], token?: string, onProgress?: Function }} [options]
 * @returns {Promise<{ ok: boolean, error?: string, spec?: string }>}
 */
async function installMarketplacePlugin(id, options = {}) {
  if (typeof id !== 'string' || !id.trim()) {
    return { ok: false, error: '缺少插件 id' };
  }
  return withPluginLock(async () => {
    const plugin = getMarketplacePlugin(id.trim());
    if (!plugin) {
      return { ok: false, error: '未收录该插件' };
    }
    const spec = plugin.installSpec;
    if (typeof spec !== 'string' || !spec || !isAllowedMarketplaceSpec(spec, plugin)) {
      return { ok: false, error: '安装规格不受支持' };
    }
    if (isDroppedInstall(plugin, spec)) {
      return { ok: false, error: '该插件已退役，不再提供安装' };
    }
    const before = listInstalledPlugins();
    const added = await addPluginSpec(spec, options);
    if (!added.ok) {
      return added;
    }
    const names = resolveInstalledNames(added.spec, before, added.installed);
    if (names.length === 0) {
      return loadableInstallFailure(added);
    }
    if (names.every(hasLoadableEntry)) {
      return added;
    }
    const runner = pluginCommand(options);
    for (const name of names) {
      if (!hasLoadableEntry(name) && isValidPackageName(name)) {
        await runner(['remove', name], options.onProgress);
      }
    }
    return loadableInstallFailure(added);
  });
}

module.exports = {
  listInstalledPlugins,
  parseAllowBuilds,
  allowBuildsInWorkspace,
  installPlugin,
  uninstallPlugin,
  installMarketplacePlugin,
  resolveCli,
};
