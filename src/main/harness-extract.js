const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function looseHarnessRoot() {
  return path.join(process.resourcesPath, 'vendor', 'deepseek-harness');
}

function harnessArchivePath() {
  return path.join(process.resourcesPath, 'vendor', 'deepseek-harness.tar');
}

function extractedHarnessRoot() {
  return path.join(app.getPath('userData'), 'runtime', app.getVersion());
}

function hasBuiltHarness(root) {
  return fs.existsSync(path.join(root, 'apps', 'cli', 'lib', 'bin.js'))
    && fs.existsSync(path.join(root, 'apps', 'web', 'dist', 'index.html'));
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

function runTar(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      ...options,
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
  const loose = looseHarnessRoot();
  if (hasBuiltHarness(loose)) {
    return loose;
  }
  const archive = harnessArchivePath();
  if (!fs.existsSync(archive)) {
    throw new Error('安装包缺少运行时归档 deepseek-harness.tar');
  }
  log('正在解压运行时（仅首次，之后会变快）…');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  // Run tar from the archive's own directory with BOTH `-f` and `-C` spelled
  // as relative paths: GNU tar treats a `C:` drive prefix on either argument
  // as a remote host (or fails to open it), while the bundled Windows bsdtar
  // rejects GNU's `--force-local`. Relative spellings work on both.
  const archiveDir = path.dirname(archive);
  // GNU tar (Git for Windows) only understands forward-slash paths; the
  // Windows default `path.relative` returns backslashes.
  const destRel = path.relative(archiveDir, dest).replace(/\\/g, '/');
  await runTar(['-xf', path.basename(archive), '-C', destRel], { cwd: archiveDir });
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
};
