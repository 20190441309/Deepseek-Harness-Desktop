'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { harnessHasGhosttyAssets } = require('../shared/ghostty-assets');

function looseHarnessRoot() {
  return path.join(process.resourcesPath, 'vendor', 'deepseek-harness');
}

function harnessArchivePath() {
  return path.join(process.resourcesPath, 'vendor', 'deepseek-harness.tar');
}

function extractedHarnessRoot() {
  return path.join(app.getPath('userData'), 'runtime', app.getVersion());
}

/**
 * True when the tree can boot the CLI/web UI and serve Ghostty terminal assets.
 * @param {string} root
 * @returns {boolean}
 */
function hasBuiltHarness(root) {
  return fs.existsSync(path.join(root, 'apps', 'cli', 'lib', 'bin.js'))
    && fs.existsSync(path.join(root, 'apps', 'web', 'dist', 'index.html'))
    && harnessHasGhosttyAssets(root);
}

function packagedPinPath() {
  return path.join(process.resourcesPath, 'vendor', 'harness-upstream.json');
}

function readPackagedPin() {
  const file = packagedPinPath();
  if (!fs.existsSync(file)) {
    throw new Error('安装包缺少 vendor/harness-upstream.json');
  }
  const pin = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!pin || typeof pin.sha !== 'string' || !pin.sha || typeof pin.npm !== 'string' || !pin.npm) {
    throw new Error('安装包 harness-upstream.json 无效');
  }
  return pin;
}

function runtimeStampPath(dest) {
  return path.join(dest, '.dshd-runtime.json');
}

function readRuntimeStamp(dest) {
  const file = runtimeStampPath(dest);
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeRuntimeStamp(dest, identity) {
  fs.writeFileSync(runtimeStampPath(dest), `${JSON.stringify(identity)}\n`);
}

function packagedRuntimeIdentity(pin, archiveBytes) {
  return {
    sha: pin.sha,
    npm: pin.npm,
    archiveBytes,
  };
}

/**
 * Same desktop version reuses userData/runtime/<version>. Overlay installs must
 * not keep a previous Harness tree just because bin.js and Ghostty exist.
 * @param {string} dest
 * @param {{ sha: string, npm: string, archiveBytes: number }} identity
 * @returns {boolean}
 */
function canReuseExtractedHarness(dest, identity) {
  if (!identity || typeof identity.sha !== 'string' || typeof identity.npm !== 'string') {
    return false;
  }
  if (!Number.isFinite(identity.archiveBytes)) {
    return false;
  }
  if (!hasBuiltHarness(dest)) {
    return false;
  }
  const stamp = readRuntimeStamp(dest);
  if (!stamp) {
    return false;
  }
  return stamp.sha === identity.sha
    && stamp.npm === identity.npm
    && stamp.archiveBytes === identity.archiveBytes;
}

function packagedHarnessRoot() {
  const extracted = extractedHarnessRoot();
  if (hasBuiltHarness(extracted)) {
    return extracted;
  }
  const loose = looseHarnessRoot();
  if (hasBuiltHarness(loose)) {
    return loose;
  }
  return extracted;
}

function tarCommand(platform = process.platform) {
  if (platform !== 'win32') {
    return 'tar';
  }
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  const systemTar = path.join(windowsRoot, 'System32', 'tar.exe');
  return fs.existsSync(systemTar) ? systemTar : 'tar';
}

function runTar(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(tarCommand(), args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `tar 退出码 ${code}`));
    });
  });
}

async function ensurePackagedHarness(log = () => {}) {
  if (!app.isPackaged) {
    return null;
  }
  const dest = extractedHarnessRoot();
  const archive = harnessArchivePath();
  const identity = fs.existsSync(archive)
    ? packagedRuntimeIdentity(readPackagedPin(), fs.statSync(archive).size)
    : null;
  if (identity && canReuseExtractedHarness(dest, identity)) {
    return dest;
  }
  if (fs.existsSync(dest)) {
    log(hasBuiltHarness(dest) ? '运行时与安装包不一致，正在重新解压…' : '运行时不完整，正在重新解压…');
    fs.rmSync(dest, { recursive: true, force: true });
  }
  const loose = looseHarnessRoot();
  if (hasBuiltHarness(loose)) {
    return loose;
  }
  if (!fs.existsSync(archive)) {
    throw new Error('安装包缺少运行时归档 deepseek-harness.tar');
  }
  if (!identity) {
    throw new Error('安装包缺少 vendor/harness-upstream.json');
  }
  log('正在解压运行时（仅首次，之后会变快）…');
  fs.mkdirSync(dest, { recursive: true });
  await runTar(['-xf', archive, '-C', dest]);
  if (!hasBuiltHarness(dest)) {
    throw new Error('运行时解压不完整，请重新安装');
  }
  writeRuntimeStamp(dest, identity);
  log(`运行时已解压到 ${dest}`);
  return dest;
}

module.exports = {
  harnessArchivePath,
  extractedHarnessRoot,
  packagedHarnessRoot,
  ensurePackagedHarness,
  hasBuiltHarness,
  canReuseExtractedHarness,
  packagedRuntimeIdentity,
  writeRuntimeStamp,
  tarCommand,
};
