// 把官方 deepseek-harness 的最新提交合并进 vendor/deepseek-harness。
//
// vendor/deepseek-harness 是 git subtree：二次开发直接改这个目录、正常提交；
// 本脚本用 `git subtree pull --squash` 做三方合并，上游更新和本地定制自动融合，
// 只有双方改了同一处时才需要手动解决冲突。
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const PREFIX = 'vendor/deepseek-harness';
const REPO = 'https://github.com/deepseek-ai/deepseek-harness.git';
const branch = process.argv[2] || 'master';

function git(args, options) {
  return spawnSync('git', args, { cwd: root, shell: false, ...options });
}

// subtree pull 是一次真正的 merge，要求已跟踪文件没有未提交改动。
const dirty = git(['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' });
if (dirty.stdout.trim() !== '') {
  console.error('工作区有未提交的改动，请先提交或 stash 再同步：');
  console.error(dirty.stdout);
  process.exit(1);
}

console.log(`> git subtree pull --prefix=${PREFIX} ${REPO} ${branch} --squash`);
const pull = git(
  [
    'subtree', 'pull',
    `--prefix=${PREFIX}`,
    REPO, branch,
    '--squash',
    '-m', `Sync vendored deepseek-harness with upstream ${branch}`,
  ],
  { stdio: 'inherit' },
);

if (pull.status !== 0) {
  console.error('');
  console.error('同步没有完成。如果上面是合并冲突：');
  console.error('  1. 逐个打开冲突文件，在上游更新和本地定制之间做取舍');
  console.error('  2. git add <解决完的文件>');
  console.error('  3. git commit  （完成这次 subtree 合并）');
  console.error('如果想放弃这次同步：git merge --abort');
  process.exit(pull.status || 1);
}

console.log('');
console.log('上游已合并。接下来在 vendor/deepseek-harness 里重装依赖并重新构建：');
console.log('  npm run setup:harness');
console.log('构建通过后正常推送即可。');
