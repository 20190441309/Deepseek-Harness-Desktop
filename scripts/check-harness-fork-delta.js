'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { readPin, peelToCommit } = require('../src/shared/harness-upstream');
const {
  UNREGISTERED_BASELINE,
  parseNameStatusZ,
  buildReport,
  unregisteredHotspots,
  evaluateBaseline,
} = require('../src/shared/harness-fork-delta');

/**
 * Fork-delta telemetry gate (decoupling Phase 0): diff the committed
 * vendor/deepseek-harness tree against the upstream pin and classify every
 * changed path against the fork registry in harness-desktop-forks.js.
 * Fails when unregistered drift exceeds UNREGISTERED_BASELINE — new fork
 * surface must either be registered or the baseline consciously raised in
 * the same PR. Read-only; fetches the pin ref from upstream when the pin
 * commit is not already in the local object store.
 *
 *   node scripts/check-harness-fork-delta.js [--json <path>] [--list-unregistered]
 */

const PREFIX = 'vendor/deepseek-harness';
const root = path.join(__dirname, '..');

function git(args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024 });
}

function gitOk(args, message) {
  const result = git(args);
  if (result.status !== 0) {
    throw new Error(message || `git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result;
}

function parseArgs(argv) {
  const parsed = { json: null, listUnregistered: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') {
      parsed.json = argv[i + 1];
      i += 1;
      if (!parsed.json) {
        throw new Error('--json requires a path');
      }
      continue;
    }
    if (argv[i] === '--list-unregistered') {
      parsed.listUnregistered = true;
      continue;
    }
    throw new Error(`unknown argument: ${argv[i]}`);
  }
  return parsed;
}

function ensurePinCommit(pin) {
  if (git(['cat-file', '-e', `${pin.sha}^{commit}`]).status === 0) {
    return;
  }
  console.log(`pin commit ${pin.sha} not local; fetching ${pin.ref} from ${pin.repo}`);
  gitOk(['fetch', pin.repo, pin.ref], `git fetch ${pin.repo} ${pin.ref} failed`);
  let peeled;
  try {
    peeled = peelToCommit((args) => git(args), pin.ref);
  } catch {
    peeled = peelToCommit((args) => git(args), 'FETCH_HEAD');
  }
  if (peeled !== pin.sha) {
    throw new Error(`fetched ${pin.ref} peels to ${peeled}, expected pin sha ${pin.sha}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const pin = readPin(root);
  ensurePinCommit(pin);

  const raw = gitOk([
    'diff-tree', '-r', '-z', '--name-status',
    `${pin.sha}^{tree}`, `HEAD:${PREFIX}`,
  ]).stdout;
  const entries = parseNameStatusZ(raw);
  const report = buildReport(entries);
  const hotspots = unregisteredHotspots(report.unregistered.entries);
  const verdict = evaluateBaseline(report);

  console.log(`fork delta vs pin ${pin.ref} (${pin.sha.slice(0, 8)}): ${report.total} changed paths`);
  for (const [bucket, count] of Object.entries(report.counts)) {
    console.log(`  ${bucket}: ${count}`);
  }
  const byStatus = Object.entries(report.unregistered.byStatus)
    .map(([status, count]) => `${status}=${count}`)
    .join(' ');
  console.log(`unregistered by status: ${byStatus || '(none)'}`);
  console.log('unregistered hotspots:');
  for (const { dir, count } of hotspots) {
    console.log(`  ${String(count).padStart(5)}  ${dir}`);
  }
  if (args.listUnregistered) {
    console.log('unregistered paths:');
    for (const entry of report.unregistered.entries) {
      console.log(`  ${entry.status}\t${entry.path}`);
    }
  }

  if (args.json) {
    const payload = {
      pin,
      baseline: UNREGISTERED_BASELINE,
      total: report.total,
      counts: report.counts,
      unregistered: report.unregistered,
      hotspots,
      ok: verdict.ok,
      failures: verdict.failures,
      improvements: verdict.improvements,
    };
    fs.writeFileSync(args.json, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`json report: ${args.json}`);
  }

  for (const note of verdict.improvements) {
    console.log(`NOTE: ${note}`);
  }
  if (!verdict.ok) {
    for (const failure of verdict.failures) {
      console.error(`FAIL: ${failure}`);
    }
    process.exit(1);
  }
  console.log(`ok: unregistered drift within baseline (total<=${UNREGISTERED_BASELINE.total}, modified<=${UNREGISTERED_BASELINE.modified})`);
}

main();
