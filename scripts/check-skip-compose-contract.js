'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  migrateLegacyDesktopBuiltins,
} = require('../src/main/desktop-builtin-migrate');
const {
  DESKTOP_INSTALL_BEGIN,
  DESKTOP_INSTALL_END,
} = require('../src/main/plugins');

/**
 * Skip compose contract against the REAL dsh CLI (`dsh web --dump-config`):
 * built-ins compose through @deepseek-ai/dsh-web-app on BOTH rounds; the user
 * layer stays out on skip. The fixture replays managed-block migration.
 */

const CANARY_ID = 'dshd-contract-canary-user-plugin';
const INSTALL_ID = 'dshd-desktop-plugin-install';
const IM_ID = 'xmanrui-dsh-im';
const USAGE_ID = 'usage-stats';
const DUMP_TIMEOUT_MS = 120_000;

const CANARY_PATCH = [
  '- insert:',
  `    - id: ${CANARY_ID}`,
  `      name: ${JSON.stringify(CANARY_ID)}`,
  '',
].join('\n');

const LEGACY_MANAGED_BLOCK = (href) => [
  DESKTOP_INSTALL_BEGIN,
  '- insert:',
  `    - id: ${INSTALL_ID}`,
  `      name: ${JSON.stringify(href)}`,
  DESKTOP_INSTALL_END,
  '',
].join('\n');

const BUILTIN_IDS = [INSTALL_ID, IM_ID, USAGE_ID];

function countOccurrences(text, needle) {
  return String(text).split(needle).length - 1;
}

/**
 * @param {'skip'|'full'} round
 * @param {string} stdout
 * @returns {string[]} problems
 */
function composeContractProblems(round, stdout) {
  const text = String(stdout || '');
  const problems = [];
  for (const id of BUILTIN_IDS) {
    const installCount = countOccurrences(text, id);
    if (installCount === 0) {
      problems.push(`${round}: dump 输出缺少桌面内置行 ${id}`);
    } else if (installCount > 1) {
      problems.push(`${round}: 桌面内置行 ${id} 出现 ${installCount} 次——双挂载`);
    }
  }
  if (round === 'skip') {
    if (text.includes(CANARY_ID)) {
      problems.push(`${round}: 用户层 canary 行仍被 compose——--skip-user-plugins 未生效`);
    }
  } else if (!text.includes(CANARY_ID)) {
    problems.push(`${round}: 用户层 canary 行未被 compose——canary 植入或用户层读取失效`);
  }
  return problems;
}

/**
 * @param {string} binJs
 * @returns {Array<{ round: 'skip'|'full', args: string[] }>}
 */
function composeContractRounds(binJs) {
  return [
    { round: 'skip', args: [binJs, 'web', '--skip-user-plugins', '--dump-config'] },
    { round: 'full', args: [binJs, 'web', '--dump-config'] },
  ];
}

function runSkipComposeContract(harnessRoot, options = {}) {
  const spawn = options.spawnSync || spawnSync;
  const nodeBin = options.nodeBin || process.execPath;
  const log = options.log || (() => {});
  const binJs = path.join(harnessRoot, 'apps', 'cli', 'lib', 'bin.js');
  if (!fs.existsSync(binJs)) {
    throw new Error(`skip compose 契约门禁：缺少已构建的 CLI ${binJs}`);
  }
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dshd-compose-contract-'));
  try {
    const profileDir = path.join(home, 'profiles', 'web');
    fs.mkdirSync(profileDir, { recursive: true });
    const stalePlaceholderHref = 'file:///stale/desktop-plugins/install-dsh-plugin/install-dsh-plugin.mjs';
    fs.writeFileSync(
      path.join(profileDir, 'cordis.patch.yml'),
      `${CANARY_PATCH}\n${LEGACY_MANAGED_BLOCK(stalePlaceholderHref)}`,
      'utf8',
    );
    const ensure = migrateLegacyDesktopBuiltins({ profileDir });
    if (!ensure || ensure.ok !== true) {
      throw new Error('skip compose 契约门禁：migrateLegacyDesktopBuiltins 失败');
    }
    const migrated = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    if (migrated.includes(DESKTOP_INSTALL_BEGIN)) {
      throw new Error('skip compose 契约门禁：受管块迁移失败——cordis.patch.yml 仍含桌面受管块');
    }
    if (!migrated.includes(CANARY_ID)) {
      throw new Error('skip compose 契约门禁：受管块迁移弄丢了用户行——canary 从 cordis.patch.yml 消失');
    }
    const env = { ...process.env, DSH_HOME: home };
    delete env.DSHD_HOME;
    delete env.DSH_HARNESS_ROOT;
    const problems = [];
    for (const { round, args } of composeContractRounds(binJs)) {
      log(`dump-config ${round} 轮…`);
      const result = spawn(nodeBin, args, {
        encoding: 'utf8',
        env,
        timeout: DUMP_TIMEOUT_MS,
        windowsHide: true,
      });
      if (result.error) {
        problems.push(`${round}: 无法运行 dump-config：${result.error.message}`);
        continue;
      }
      if (result.status !== 0) {
        const stderr = String(result.stderr || '').trim().slice(0, 400);
        problems.push(`${round}: dump-config 退出码 ${result.status}${stderr ? `：${stderr}` : ''}`);
        continue;
      }
      problems.push(...composeContractProblems(round, result.stdout));
    }
    if (problems.length > 0) {
      throw new Error(`skip compose 契约失败：${problems.join('；')}`);
    }
    return { ok: true, rounds: 2 };
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

module.exports = {
  CANARY_ID,
  INSTALL_ID,
  IM_ID,
  USAGE_ID,
  composeContractProblems,
  composeContractRounds,
  runSkipComposeContract,
};

if (require.main === module) {
  const root = path.resolve(process.argv[2] || path.join(__dirname, '..', 'vendor', 'deepseek-harness'));
  try {
    runSkipComposeContract(root, { log: (line) => console.log(line) });
    console.log(`skip compose 契约通过（${root}）`);
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  }
}
