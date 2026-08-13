const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const vendor = path.join(root, 'vendor', 'deepseek-harness');
const repo = 'https://github.com/deepseek-ai/deepseek-harness.git';

function run(command, args, cwd) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (!fs.existsSync(path.join(vendor, 'package.json'))) {
  fs.mkdirSync(path.dirname(vendor), { recursive: true });
  run('git', ['clone', '--depth', '1', '--branch', 'master', repo, vendor], root);
}

run('pnpm', ['install'], vendor);
run('pnpm', ['run', 'build'], vendor);
console.log(`官方源码已就绪：${vendor}`);
