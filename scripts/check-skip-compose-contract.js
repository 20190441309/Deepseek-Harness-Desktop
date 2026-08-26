'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  ensureDesktopInstallPlugin,
  DESKTOP_INSTALL_BEGIN,
  DESKTOP_INSTALL_END,
} = require('../src/main/plugins');

/**
 * Skip compose contract against the REAL dsh CLI (`dsh web --dump-config`):
 * every desktop start passes the desktop-owned install overlay via `--patch`;
 * a skip start must compose the overlay while the user layer stays out, and
 * a full start must compose both. The fixture also replays the managed-block
 * migration: the temp profile starts with a canary user row PLUS the legacy
 * managed block, and ensure must strip the block (keeping the canary) or the
 * full round double-mounts the install row. Unit tests mock `dsh.start`, so
 * only this check catches CLI-side semantic drift (e.g. `--skip-user-plugins`
 * no longer excluding the user layer, or no longer applying `--patch`
 * overlays). Runs in after-pack against the assembled packaged runtime, and
 * standalone against a built source tree:
 *
 *   node scripts/check-skip-compose-contract.js [harnessRoot]
 */

const CANARY_ID = 'dshd-contract-canary-user-plugin';
const INSTALL_ID = 'dshd-desktop-plugin-install';
const DUMP_TIMEOUT_MS = 120_000;

const CANARY_PATCH = [
  '- insert:',
  `    - id: ${CANARY_ID}`,
  `      name: ${JSON.stringify(CANARY_ID)}`,
  '',
].join('\n');

// The exact block bodies earlier desktop versions upserted into the user's
// cordis.patch.yml; the fixture seeds them so the run proves the migration
// strips them (a stale copy composed next to the overlay double-mounts).
const LEGACY_MANAGED_BLOCK = (href) => [
  DESKTOP_INSTALL_BEGIN,
  '- insert:',
  `    - id: ${INSTALL_ID}`,
  `      name: ${JSON.stringify(href)}`,
  DESKTOP_INSTALL_END,
  '',
].join('\n');

function countOccurrences(text, needle) {
  return String(text).split(needle).length - 1;
}

/**
 * Pure verdict on one dump-config round. The positive assertion comes first:
 * an empty or truncated dump must fail on the missing install row, never
 * pass because the canary also vanished with everything else. Exactly one
 * install row per round — a second one means a stale managed block composed
 * next to the overlay (the CLI's `insert` does not dedupe by id).
 * @param {'skip'|'full'} round
 * @param {string} stdout
 * @returns {string[]} problems, empty when the round honors the contract.
 */
function composeContractProblems(round, stdout) {
  const text = String(stdout || '');
  const problems = [];
  const installCount = countOccurrences(text, INSTALL_ID);
  if (installCount === 0) {
    problems.push(`${round}: dump 输出缺少桌面安装插件行 ${INSTALL_ID}`);
  } else if (installCount > 1) {
    problems.push(`${round}: 桌面安装插件行出现 ${installCount} 次——受管块残留与 overlay 双挂载`);
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
 * The two dump-config invocations, mirroring the desktop's production argv:
 * the overlay rides `--patch` on BOTH rounds (launcher flags stay in the CLI
 * grammar prefix, before any app arg).
 * @param {string} binJs - absolute path of apps/cli/lib/bin.js.
 * @param {string} overlayFile - the desktop-owned install overlay.
 * @returns {Array<{ round: 'skip'|'full', args: string[] }>}
 */
function composeContractRounds(binJs, overlayFile) {
  return [
    { round: 'skip', args: [binJs, 'web', '--skip-user-plugins', '--patch', overlayFile, '--dump-config'] },
    { round: 'full', args: [binJs, 'web', '--patch', overlayFile, '--dump-config'] },
  ];
}

/**
 * Run the contract against one harness root (source tree with built lib, or
 * the assembled packaged runtime). Throws with every collected problem on
 * violation; a missing built CLI is a hard error too — callers must gate on
 * a runtime that is supposed to be complete.
 * @param {string} harnessRoot
 * @param {{ spawnSync?: typeof spawnSync, nodeBin?: string, log?: (line: string) => void }} [options]
 * @returns {{ ok: true, rounds: number }}
 */
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
    // Migration replay: the profile starts as an upgraded install would —
    // a canary user row plus the managed block an earlier desktop version
    // upserted. ensureDesktopInstallPlugin must strip the block (keeping the
    // canary) and write the overlay; the full round then proves exactly one
    // install row composes.
    const stalePlaceholderHref = 'file:///stale/desktop-plugins/install-dsh-plugin/install-dsh-plugin.mjs';
    fs.writeFileSync(
      path.join(profileDir, 'cordis.patch.yml'),
      `${CANARY_PATCH}\n${LEGACY_MANAGED_BLOCK(stalePlaceholderHref)}`,
      'utf8',
    );
    const ensure = ensureDesktopInstallPlugin({ profileDir });
    if (!ensure || ensure.ok !== true) {
      throw new Error(`skip compose 契约门禁：ensureDesktopInstallPlugin 失败（${(ensure && ensure.reason) || 'unknown'}）`);
    }
    const migrated = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8');
    if (migrated.includes(DESKTOP_INSTALL_BEGIN)) {
      throw new Error('skip compose 契约门禁：受管块迁移失败——cordis.patch.yml 仍含桌面受管块');
    }
    if (!migrated.includes(CANARY_ID)) {
      throw new Error('skip compose 契约门禁：受管块迁移弄丢了用户行——canary 从 cordis.patch.yml 消失');
    }
    // The child must compose against the throwaway home only — never an
    // inherited desktop/official home (dsh-home rule).
    const env = { ...process.env, DSH_HOME: home };
    delete env.DSHD_HOME;
    delete env.DSH_HARNESS_ROOT;
    const problems = [];
    for (const { round, args } of composeContractRounds(binJs, ensure.overlayFile)) {
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
