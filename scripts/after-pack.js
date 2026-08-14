const { execFileSync } = require('child_process');
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

function shouldSkip(src, root, expandNested = false, skipStore = false) {
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
    if (skipStore && part === '.pnpm') {
      // deploy 目录：顶层链接已解引用覆盖全部运行时包，.pnpm store 是硬链接重复，
      // 跳过可避免 10 倍展开（体积与内存）
      return true;
    }
    if (part === 'node_modules') {
      nodeModulesSeen += 1;
      if (nodeModulesSeen >= 3 && !expandNested) {
        // .pnpm 条目内的二级以上嵌套 node_modules：对完整 workspace 是冗余链接；
        // 对 deploy 目录（expandNested）是版本隔离依赖，必须保留
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
 * - 复制时由 fs.copyFile 解引用链接（复制目标内容）
 * - flat: 拍平模式——.pnpm store 条目提升到 node_modules/<pkg>（短路径，避免 NSIS
 *   长路径失败），全部内容保留（不丢包）
 */
function collectFiles(root, destRoot, expandNested = false, flat = false) {
  const files = [];
  const ancestors = new Set();
  const topNodeModules = path.join(path.resolve(destRoot), 'node_modules');

  function walk(src, dest) {
    if (shouldSkip(src, root, expandNested)) {
      return;
    }
    if (flat && src.endsWith(`${path.sep}node_modules`) && dest !== topNodeModules) {
      // 任意 node_modules 目录（根 / .pnpm 条目 / 包内嵌套）都提升到顶层，
      // 避免超长路径触发 NSIS 260 字符限制
      dest = topNodeModules;
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
      const base = path.basename(src);
      if (/\.(map|tsbuildinfo|md|d\.ts)$/i.test(base)) {
        return;
      }
      if (/^(license|licence|changelog|changes|authors|contributing)(\.|$)/i.test(base)) {
        return;
      }
      files.push({ src, dest });
    }
  }

  walk(path.resolve(root), path.resolve(destRoot));
  return files;
}

/** 并发复制（fs.copyFile 总是解引用链接，复制目标内容；EBUSY 重试以对抗杀软扫描） */
async function copyFiles(files, limit = 32) {
  let idx = 0;
  let retried = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (idx < files.length) {
      const item = files[idx];
      idx += 1;
      fs.mkdirSync(longPath(path.dirname(item.dest)), { recursive: true });
      for (let attempt = 0; ; attempt += 1) {
        try {
          await fs.promises.copyFile(longPath(item.src), longPath(item.dest));
          break;
        } catch (error) {
          if (error.code === 'EBUSY' && attempt < 3) {
            retried += 1;
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            continue;
          }
          throw error;
        }
      }
    }
  });
  await Promise.all(workers);
  if (retried) {
    console.log(`（EBUSY 重试 ${retried} 次）`);
  }
  return files.length;
}

/**
 * 用精简 deploy 目录组装 resources/vendor/deepseek-harness：
 *   apps/cli     <- deploy 根内容（lib/ config/ package.json，不含 node_modules）
 *   apps/web/dist<- vendor 源码构建产物
 *   node_modules <- deploy/node_modules（扁平依赖，完整展开以保留版本隔离嵌套）
 *   vendor       <- deploy/vendor（本地 cordis 插件包源）
 * 该结构已被验证可完整启动 dsh web（scripts/patch-deploy.js 迭代补齐）。
 */
async function assembleFromDeploy(projectDir, deployDir, harnessDest) {
  const vendorSrc = path.join(projectDir, 'vendor', 'deepseek-harness');
  // 1) apps/cli <- deploy 根内容（排除 node_modules 与 vendor，它们单独复制）
  const cliDest = path.join(harnessDest, 'apps', 'cli');
  let total = 0;
  for (const n of fs.readdirSync(deployDir, { withFileTypes: true })) {
    if (n.name === 'node_modules' || n.name === 'vendor') {
      continue;
    }
    const files = collectFiles(path.join(deployDir, n.name), path.join(cliDest, n.name), true);
    total += await copyFiles(files, 32);
  }
  // 2) node_modules：
  //    a) 顶层条目逐个收集（链接解引用后以真实路径为根）
  //    b) 拍平 .pnpm store：每个条目的包内容复制到顶层（目标已存在则跳过），
  //       使顶层覆盖全部运行时包，同时避免硬链接重复展开
  const nmSrc = path.join(deployDir, 'node_modules');
  const nmDest = path.join(harnessDest, 'node_modules');
  for (const n of fs.readdirSync(nmSrc, { withFileTypes: true })) {
    if (n.name === '.pnpm') {
      continue;
    }
    const s = path.join(nmSrc, n.name);
    const d = path.join(nmDest, n.name);
    const root = n.isSymbolicLink() ? realOf(s) : s;
    const files = collectFiles(root, d, false, false);
    total += await copyFiles(files, 32);
  }
  const storeDir = path.join(nmSrc, '.pnpm');
  if (fs.existsSync(storeDir)) {
    const flattened = [];
    const seen = new Set();
    const flattenPkg = (pkgDir, destDir) => {
      if (!fs.existsSync(path.join(pkgDir, 'package.json'))) {
        return;
      }
      if (seen.has(destDir) || fs.existsSync(path.join(destDir, 'package.json'))) {
        return;
      }
      seen.add(destDir);
      const files = collectFiles(pkgDir, destDir, false, false);
      for (const f of files) {
        flattened.push(f);
      }
    };
    for (const entry of fs.readdirSync(storeDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const entryNm = path.join(storeDir, entry.name, 'node_modules');
      if (!fs.existsSync(entryNm)) {
        continue;
      }
      // 条目名 -> 包名：@scope+name@ver 或 @scope+name_hash -> [@scope, name]；name@ver / name_hash -> [name]
      const parts = entry.name.split('+');
      const scope = parts.length > 1 ? parts[0] : null;
      const bare = (parts.length > 1 ? parts[1] : parts[0]).split('@')[0].split('_')[0];
      flattenPkg(
        path.join(entryNm, scope || '', bare),
        path.join(nmDest, scope || '', bare)
      );
    }
    // 共享目录 .pnpm/node_modules（被多个条目引用的包；条目是 junction 链接）
    const sharedDir = path.join(storeDir, 'node_modules');
    if (fs.existsSync(sharedDir)) {
      for (const n of fs.readdirSync(sharedDir, { withFileTypes: true })) {
        if (!n.isDirectory() && !n.isSymbolicLink()) {
          continue;
        }
        const sharedPkg = path.join(sharedDir, n.name);
        if (n.name.startsWith('@')) {
          for (const s of fs.readdirSync(sharedPkg, { withFileTypes: true })) {
            if (s.isDirectory() || s.isSymbolicLink()) {
              flattenPkg(path.join(sharedPkg, s.name), path.join(nmDest, n.name, s.name));
            }
          }
        } else {
          flattenPkg(sharedPkg, path.join(nmDest, n.name));
        }
      }
    }
    console.log(`拍平 .pnpm store: ${flattened.length} 个文件`);
    total += await copyFiles(flattened, 32);
  }
  const jobs = [
    [path.join(deployDir, 'vendor'), path.join(harnessDest, 'vendor')],
    [path.join(vendorSrc, 'apps', 'web', 'dist'), path.join(harnessDest, 'apps', 'web', 'dist')],
  ];
  for (const [src, dest] of jobs) {
    if (!fs.existsSync(src)) {
      throw new Error(`精简目录缺少 ${src}`);
    }
    const files = collectFiles(src, dest, false, false);
    total += await copyFiles(files, 32);
  }
  return total;
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
  const harnessDest = path.join(resources, 'vendor', 'deepseek-harness');
  const deployEnv = process.env.DSH_DEPLOY_DIR;
  const deployDir = deployEnv && deployEnv !== 'off'
    ? deployEnv
    : (!deployEnv
      ? [path.join(projectDir, '.pack-v3'), path.join(projectDir, '.pack-tmp')]
        .find((d) => fs.existsSync(path.join(d, 'lib', 'bin.js')))
      : null);
  const started = Date.now();

  let copied;
  if (deployDir) {
    console.log(`使用精简目录 ${deployDir} 组装 resources/vendor`);
    copied = await assembleFromDeploy(projectDir, deployDir, harnessDest);
  } else {
    console.log('未找到精简目录，回退全量复制（拍平 .pnpm 到顶层，避免超长路径）');
    const harnessSrc = path.join(projectDir, 'vendor', 'deepseek-harness');
    console.log('收集文件清单（解引用 pnpm 链接，跳过循环与 dev-only 包）...');
    const files = collectFiles(harnessSrc, harnessDest, false, true);
    console.log(`待复制 ${files.length} 个文件，收集耗时 ${((Date.now() - started) / 1000).toFixed(1)}s（并发复制中）`);
    copied = await copyFiles(files, 32);
  }

  const nodeDest = copyBundledNode(resources);
  const binJs = path.join(harnessDest, 'apps', 'cli', 'lib', 'bin.js');
  const webDist = path.join(harnessDest, 'apps', 'web', 'dist', 'index.html');
  if (!fs.existsSync(binJs) || !fs.existsSync(webDist)) {
    throw new Error('安装包缺少 dsh 构建产物，请先在 vendor/deepseek-harness 跑 pnpm run build');
  }

  const archive = path.join(resources, 'vendor', 'deepseek-harness.tar');
  console.log('打包运行时为单个 tar，减少 NSIS 解压文件数…');
  execFileSync('tar', ['-cf', archive, '-C', harnessDest, '.'], { stdio: 'inherit' });
  if (!fs.existsSync(archive) || fs.statSync(archive).size < 1024) {
    throw new Error('运行时 tar 生成失败');
  }
  fs.rmSync(longPath(harnessDest), { recursive: true, force: true });

  console.log(`已复制 ${copied} 个文件，写入 ${nodeDest}`);
  console.log(`运行时归档 ${((fs.statSync(archive).size / 1048576).toFixed(1))} MB`);
  console.log(`afterPack 完成 ${((Date.now() - started) / 1000).toFixed(1)}s`);
};

module.exports.collectFiles = collectFiles;
module.exports.copyFiles = copyFiles;
