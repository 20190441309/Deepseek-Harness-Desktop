const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  '.git',
  '.github',
  '.agents',
  '.artifacts',
  '.cache',
  '.sessions',
  '.storages',
  '.turbo',
  '.vite',
  '.vite-temp',
  '.worktrees',
  '__pycache__',
  'coverage',
  'docs',
  'examples',
  'python',
  'website',
  'worktrees',
]);

function longPath(target) {
  const abs = path.resolve(target);
  if (process.platform !== 'win32' || abs.length < 240) {
    return abs;
  }
  if (abs.startsWith('\\\\?\\')) {
    return abs;
  }
  if (abs.startsWith('\\\\')) {
    return `\\\\?\\UNC\\${abs.slice(2)}`;
  }
  return `\\\\?\\${abs}`;
}

function shouldSkip(src, root) {
  const rel = path.relative(root, src);
  if (!rel || rel.startsWith('..')) {
    return false;
  }
  return rel.split(path.sep).some((part) => SKIP_DIRS.has(part));
}

function realOf(target) {
  try {
    return fs.realpathSync(path.resolve(target));
  } catch {
    return path.resolve(target);
  }
}

function copyHarness(root, destRoot) {
  let files = 0;
  const stack = [{ src: path.resolve(root), dest: path.resolve(destRoot), ancestors: new Set() }];
  while (stack.length) {
    const { src, dest, ancestors } = stack.pop();
    if (shouldSkip(src, root)) {
      continue;
    }
    let lstat;
    try {
      lstat = fs.lstatSync(src);
    } catch {
      continue;
    }

    if (lstat.isSymbolicLink() || lstat.isDirectory()) {
      const real = realOf(src);
      if (ancestors.has(real)) {
        continue;
      }
      let realStat;
      try {
        realStat = fs.statSync(real);
      } catch {
        continue;
      }
      if (realStat.isFile()) {
        fs.mkdirSync(longPath(path.dirname(dest)), { recursive: true });
        fs.copyFileSync(real, longPath(dest));
        files += 1;
        continue;
      }
      const next = new Set(ancestors);
      next.add(real);
      fs.mkdirSync(longPath(dest), { recursive: true });
      let names;
      try {
        names = fs.readdirSync(src);
      } catch {
        continue;
      }
      for (let i = names.length - 1; i >= 0; i -= 1) {
        const name = names[i];
        stack.push({
          src: path.join(src, name),
          dest: path.join(dest, name),
          ancestors: next,
        });
      }
      continue;
    }

    if (lstat.isFile()) {
      fs.mkdirSync(longPath(path.dirname(dest)), { recursive: true });
      fs.copyFileSync(src, longPath(dest));
      files += 1;
    }
  }
  return files;
}

function copyBundledNode(destDir) {
  const src = [
    process.env.NODE_BINARY,
    process.execPath,
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
  ].find((candidate) => candidate && fs.existsSync(candidate) && !/electron/i.test(candidate));
  if (!src) {
    throw new Error('打包时未找到 node.exe，安装包将无法启动官方 Web UI');
  }
  const dest = path.join(destDir, process.platform === 'win32' ? 'node.exe' : 'node');
  fs.copyFileSync(src, dest);
  return dest;
}

module.exports = async function afterPack(context) {
  const projectDir = context.packager.projectDir;
  const resources = path.join(context.appOutDir, 'resources');
  const harnessSrc = path.join(projectDir, 'vendor', 'deepseek-harness');
  const harnessDest = path.join(resources, 'vendor', 'deepseek-harness');
  const started = Date.now();
  console.log(`打包官方源码（解引用 pnpm 链接，跳过循环）-> ${harnessDest}`);
  const files = copyHarness(harnessSrc, harnessDest);
  const nodeDest = copyBundledNode(resources);
  const binJs = path.join(harnessDest, 'apps', 'cli', 'lib', 'bin.js');
  const webDist = path.join(harnessDest, 'apps', 'web', 'dist', 'index.html');
  if (!fs.existsSync(binJs) || !fs.existsSync(webDist)) {
    throw new Error('安装包缺少 dsh 构建产物，请先在 vendor/deepseek-harness 跑 pnpm run build');
  }
  console.log(`已复制 ${files} 个文件，写入 ${nodeDest}`);
  console.log(`afterPack 完成 ${((Date.now() - started) / 1000).toFixed(1)}s`);
};
