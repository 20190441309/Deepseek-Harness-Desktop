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
  if (hasBuiltHarness(dest)) {
    return dest;
  }
  // Incomplete extract (e.g. 0.2.6 missing Ghostty wasm) must not stick forever.
  if (fs.existsSync(dest)) {
    log('运行时不完整，正在重新解压…');
    fs.rmSync(dest, { recursive: true, force: true });
  }
  const loose = looseHarnessRoot();
  if (hasBuiltHarness(loose)) {
    return loose;
  }
  const archive = harnessArchivePath();
  if (!fs.existsSync(archive)) {
    throw new Error('安装包缺少运行时归档 deepseek-harness.tar');
  }
  log('正在解压运行时（仅首次，之后会变快）…');
  fs.mkdirSync(dest, { recursive: true });
  await runTar(['-xf', archive, '-C', dest]);
  if (!hasBuiltHarness(dest)) {
    throw new Error('运行时解压不完整，请重新安装');
  }
  log(`运行时已解压到 ${dest}`);
  return dest;
}

module.exports = {
  harnessArchivePath,
  extractedHarnessRoot,
  packagedHarnessRoot,
  ensurePackagedHarness,
  hasBuiltHarness,
  tarCommand,
};
