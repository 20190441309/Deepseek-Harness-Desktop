'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CANARY_ID,
  INSTALL_ID,
  IM_ID,
  USAGE_ID,
  composeContractProblems,
  composeContractRounds,
  runSkipComposeContract,
} = require('../../scripts/check-skip-compose-contract');

const BUILTIN_DUMP = `- id: ${INSTALL_ID}\n- id: ${IM_ID}\n- id: ${USAGE_ID}\n`;

test('composeContractProblems demands built-in rows on both rounds', () => {
  const healthy = `- id: ${CANARY_ID}\n${BUILTIN_DUMP}`;
  assert.deepEqual(composeContractProblems('skip', BUILTIN_DUMP), []);
  assert.deepEqual(composeContractProblems('full', healthy), []);
  const empty = composeContractProblems('skip', '');
  assert.ok(empty.some((line) => line.includes(INSTALL_ID)));
  const resurrect = composeContractProblems('skip', `${BUILTIN_DUMP}- id: ${CANARY_ID}\n`);
  assert.match(resurrect[0], /--skip-user-plugins 未生效/);
  const doubled = composeContractProblems('full', `${healthy}- id: ${INSTALL_ID}\n`);
  assert.match(doubled[0], /双挂载/);
});

test('composeContractRounds no longer passes --patch overlays', () => {
  const rounds = composeContractRounds('/h/apps/cli/lib/bin.js');
  assert.deepEqual(rounds[0].args, ['/h/apps/cli/lib/bin.js', 'web', '--skip-user-plugins', '--dump-config']);
  assert.deepEqual(rounds[1].args, ['/h/apps/cli/lib/bin.js', 'web', '--dump-config']);
});

function fakeHarnessRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-harness-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'apps', 'cli', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps', 'cli', 'lib', 'bin.js'), '// stub\n');
  return root;
}

test('runSkipComposeContract replays managed-block migration without overlays', (t) => {
  const root = fakeHarnessRoot(t);
  const calls = [];
  const result = runSkipComposeContract(root, {
    spawnSync: (nodeBin, args, options) => {
      calls.push({ args, options });
      const skip = args.includes('--skip-user-plugins');
      return {
        status: 0,
        stdout: skip ? BUILTIN_DUMP : `- id: ${CANARY_ID}\n${BUILTIN_DUMP}`,
      };
    },
  });
  assert.deepEqual(result, { ok: true, rounds: 2 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].args.includes('--patch'), false);
  assert.equal(calls[1].args.includes('--patch'), false);
  const home = calls[0].options.env.DSH_HOME;
  assert.equal(fs.existsSync(home), false);
});

test('runSkipComposeContract fails when the full round composes the install row twice', (t) => {
  const root = fakeHarnessRoot(t);
  assert.throws(
    () => runSkipComposeContract(root, {
      spawnSync: (nodeBin, args) => ({
        status: 0,
        stdout: args.includes('--skip-user-plugins')
          ? BUILTIN_DUMP
          : `- id: ${CANARY_ID}\n${BUILTIN_DUMP}- id: ${INSTALL_ID}\n`,
      }),
    }),
    /双挂载/,
  );
});

test('runSkipComposeContract fails on user-layer resurrection under skip', (t) => {
  const root = fakeHarnessRoot(t);
  assert.throws(
    () => runSkipComposeContract(root, {
      spawnSync: () => ({ status: 0, stdout: `${BUILTIN_DUMP}- id: ${CANARY_ID}\n` }),
    }),
    /--skip-user-plugins 未生效/,
  );
});

test('runSkipComposeContract refuses a runtime without the built CLI', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-empty-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(() => runSkipComposeContract(root), /缺少已构建的 CLI/);
});
