'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { readPin, peelToCommit } = require('../src/shared/harness-upstream');
const { syncHarness } = require('../src/shared/harness-sync');

/**
 * Scheduled upstream sync dry-run (decoupling Phase 0): price the next pin
 * bump continuously instead of discovering it at upgrade time. Fetches the
 * upstream target ref (default: upstream HEAD), replays the sync:harness
 * subtree merge in --dry-run mode, and reports the conflict count. Report
 * only: never bumps the pin, never leaves worktrees or refs behind (the
 * dry-run path cleans both), and a conflicted merge still exits 0 — only
 * infrastructure failures (fetch, dirty tree, merge machinery) exit 1.
 *
 *   node scripts/check-harness-sync-dry-run.js [--ref <upstream ref>] [--json <path>]
 */

const root = path.join(__dirname, '..');

function git(args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024 });
}

function parseArgs(argv) {
  const parsed = { ref: 'HEAD', json: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--ref') {
      parsed.ref = argv[i + 1];
      i += 1;
      if (!parsed.ref) {
        throw new Error('--ref requires a value');
      }
      continue;
    }
    if (argv[i] === '--json') {
      parsed.json = argv[i + 1];
      i += 1;
      if (!parsed.json) {
        throw new Error('--json requires a path');
      }
      continue;
    }
    throw new Error(`unknown argument: ${argv[i]}`);
  }
  return parsed;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const pin = readPin(root);

  console.log(`fetching ${args.ref} from ${pin.repo}`);
  const fetched = git(['fetch', pin.repo, args.ref]);
  if (fetched.status !== 0) {
    throw new Error(`git fetch ${pin.repo} ${args.ref} failed: ${(fetched.stderr || fetched.stdout).trim()}`);
  }
  const targetSha = peelToCommit((gitArgs) => git(gitArgs), 'FETCH_HEAD');
  console.log(`pin: ${pin.ref} (${pin.sha.slice(0, 8)}) → target: ${args.ref} (${targetSha.slice(0, 8)})`);

  let conflicts = [];
  let upToDate = false;
  if (targetSha === pin.sha) {
    upToDate = true;
    console.log('pin already at target; nothing to merge');
  } else {
    // syncHarness fetches by (ref, sha) itself; FETCH_HEAD survives from the
    // resolve above, so pass the sha we just peeled. Symbolic HEAD does not
    // peel inside the repo, so hand the sha as the ref too.
    const syncRef = args.ref === 'HEAD' ? targetSha : args.ref;
    const result = syncHarness({ root, args: { mode: 'sync', ref: syncRef, sha: targetSha, dryRun: true } });
    if (result.status !== 'dry-run') {
      throw new Error(`expected dry-run result, got ${result.status}`);
    }
    conflicts = result.conflicts || [];
  }

  console.log(`sync dry-run conflicts: ${conflicts.length}`);
  for (const file of conflicts) {
    console.log(`  ${file}`);
  }

  if (args.json) {
    const payload = { pin, targetRef: args.ref, targetSha, upToDate, conflictCount: conflicts.length, conflicts };
    fs.writeFileSync(args.json, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`json report: ${args.json}`);
  }
  console.log(conflicts.length === 0
    ? 'ok: upstream merges cleanly onto the vendored tree'
    : 'report only: conflicts are the price of the next pin bump, not a failure');
}

main();
