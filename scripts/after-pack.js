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

// 纯构建期工具，运行时不需要；按 pnpm 目录名（<name>@<version> 或 @scope+<name>@<version>）匹配
const DEV_ONLY_NAMES = new Set([
  'typescript',
  'tsx',
  'ts-node',
  'vite',
  'vitest',
  '@vitest',
  'eslint',
  '@eslint',
  '@typescript-eslint',
  'turbo',
  'rollup',
  'webpack',
  'jest',
  '@jest',
  'playwright',
  '@playwright',
  'storybook',
  '@storybook',
  'prettier',
  'knip',
  'oxlint',
  'typedoc',
  'eslint-plugin',
  'babel',
  '@babel',
  'swc',
  '@swc',
  'nx',
  'husky',
  'lint-staged',
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

function isDevOnlyPnpmEntry(name) {
  // pnpm 条目名: typescript@5.6.3 | @types+node@22.5.0 | @eslint+eslintrc@3.1.0
  const parts = name.split('+');
  const scope = parts.length > 1 ? parts[0] : null; // 带 @ 前缀
  const base = parts[parts.length - 1].split('@')[0];
  if (scope && scope.startsWith('@types')) {
    return true;
  }
  if (DEV_ONLY_NAMES.has(base) || (scope && DEV_ONLY_NAMES.has(scope))) {
    return true;
  }
  return false;
}

function shouldSkip(src, root) {
  const rel = path.relative(root, src);
  if (!rel || rel.startsWith('..')) {
    return false;
  }
  const parts = rel.split(path.sep);
  let nodeModulesSeen = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (SKIP_DIRS.has(part)) {
      return true;
    }
    if (part === 'node_modules') {
      nodeModulesSeen += 1;
      if (nodeModulesSeen >= 3) {
        // .pnpm 条目内的二级以上嵌套 node_modules：冗余链接，store 遍历已覆盖
        return true;
      }
      if (i + 1 < parts.length && isDevOnlyPnpmEntry(parts[i + 1])) {
        return true; // node_modules 下的 dev-only 包
      }
    }
    if ((part === 'src' || part === 'tests' || part === '__tests__') && /^(packages|apps)(\\|\/)/.test(parts.slice(0, i).join(path.sep))) {
      // 只跳过 packages/ apps/ 下的源码与测试目录（node_modules 内的不动）
      return true;
    }
  }
  return false;
}

function realOf(target) {
  try {
    return fs.realpathSync(path.resolve(target));
  } catch {
    return path.resolve(target);
  }
}

/**
 * 收集需要复制的文件：
 * - 递归 + 回溯维护祖先链（防符号链接环），复用同一个 Set，避免 O(n²) 内存
 * - 不做全局去重：pnpm 非提升结构下，包内嵌套 node_modules 的每个位置都是
 *   解析必需（依赖可能只存在于嵌套中），同一 store 文件会按需展开为多份
 * - 复制时由 fs.copyFile 解引用链接（复制目标内容）
 */
function collectFiles(root, destRoot) {
  const files = [];
  const ancestors = new Set();

  function walk(src, dest) {
    if (shouldSkip(src, root)) {
      return;
    }
    let lstat;
    try {
      lstat = fs.lstatSync(src);
    } catch {
      return;
    }

    if (lstat.isSymbolicLink() || lstat.isDirectory()) {
      const real = realOf(src);
      if (ancestors.has(real)) {
        return; // 环
      }
      let realStat;
      try {
        realStat = fs.statSync(real);
      } catch {
        return;
      }
      if (realStat.isFile()) {
        files.push({ src: real, dest });
        return;
      }
      ancestors.add(real);
      let names;
      try {
        names = fs.readdirSync(src);
      } catch {
        ancestors.delete(real);
        return;
      }
      for (const name of names) {
        walk(path.join(src, name), path.join(dest, name));
      }
      ancestors.delete(real);
      return;
    }

    if (lstat.isFile()) {
      if (/\.(map|tsbuildinfo)$/.test(src)) {
        return; // 跳过 sourcemap 与 tsbuildinfo
      }
      files.push({ src, dest });
    }
  }

  walk(path.resolve(root), path.resolve(destRoot));
  return files;
}

/** 并发复制（fs.copyFile 总是解引用链接，复制目标内容） */
async function copyFiles(files, limit = 32) {
  let idx = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (idx < files.length) {
      const item = files[idx];
      idx += 1;
      fs.mkdirSync(longPath(path.dirname(item.dest)), { recursive: true });
      await fs.promises.copyFile(longPath(item.src), longPath(item.dest));
    }
  });
  await Promise.all(workers);
  return files.length;
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
  console.log('收集文件清单（解引用 pnpm 链接，去重，跳过 dev-only 包）...');
  const files = collectFiles(harnessSrc, harnessDest);
  console.log(`待复制 ${files.length} 个文件，收集耗时 ${((Date.now() - started) / 1000).toFixed(1)}s（并发复制中）`);
  const copied = await copyFiles(files, 32);
  const nodeDest = copyBundledNode(resources);
  const binJs = path.join(harnessDest, 'apps', 'cli', 'lib', 'bin.js');
  const webDist = path.join(harnessDest, 'apps', 'web', 'dist', 'index.html');
  if (!fs.existsSync(binJs) || !fs.existsSync(webDist)) {
    throw new Error('安装包缺少 dsh 构建产物，请先在 vendor/deepseek-harness 跑 pnpm run build');
  }
  console.log(`已复制 ${copied} 个文件，写入 ${nodeDest}`);
  console.log(`afterPack 完成 ${((Date.now() - started) / 1000).toFixed(1)}s`);
};
