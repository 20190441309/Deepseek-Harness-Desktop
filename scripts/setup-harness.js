const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { readPin } = require('../src/shared/harness-upstream');

const root = path.join(__dirname, '..');
const vendor = path.join(root, 'vendor', 'deepseek-harness');
const pnpm = path.join(root, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');

function run(command, args, cwd) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (!fs.existsSync(path.join(vendor, 'package.json'))) {
  const pin = readPin(root);
  fs.mkdirSync(path.dirname(vendor), { recursive: true });
  run('git', ['clone', '--depth', '1', '--branch', pin.ref, pin.repo, vendor], root);
  const head = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: vendor,
    encoding: 'utf8',
    shell: false,
  }).stdout.trim();
  if (head !== pin.sha) {
    console.error(`setup:harness HEAD ${head} != pin.sha ${pin.sha}`);
    process.exit(1);
  }
}

run(process.execPath, [pnpm, 'install', '--frozen-lockfile'], vendor);
run(process.execPath, [pnpm, 'run', 'build'], vendor);

const { installPluginRuntimeDeps } = require('./after-pack');
const dshmarket = path.join(root, 'vendor', 'dshmarket');
if (fs.existsSync(path.join(dshmarket, 'package.json'))) {
  installPluginRuntimeDeps(dshmarket, { skipIfComplete: true });
}

console.log(`官方源码已就绪：${vendor}`);
