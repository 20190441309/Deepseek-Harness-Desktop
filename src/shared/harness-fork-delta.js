'use strict';

const { DESKTOP_PACKAGES, FORK_FILE_MARKERS, COMPOSITION_ROWS } = require('./harness-desktop-forks');

/**
 * Fork-delta classification: every path in `git diff` between the upstream
 * pin tree and `HEAD:vendor/deepseek-harness` falls into exactly one bucket.
 *
 * - registered-package: under a DESKTOP_PACKAGES dir (whole desktop-owned package)
 * - composition:        a COMPOSITION_ROWS patch file (desktop rows in upstream bundles)
 * - marked-file:        a FORK_FILE_MARKERS path (file-level fork in an upstream package)
 * - unregistered:       fork drift no registry entry accounts for
 */
const BUCKETS = ['registered-package', 'marked-file', 'composition', 'unregistered'];

/**
 * Unregistered-drift baseline, measured 2026-08-27 on main@581547eb against
 * pin dsh-v0.1.1-rc.1 @ 528c682e061696f5a160f363f236ecbf53cbd006:
 * 1,372 changed paths → 431 registered-package, 18 marked-file, 2 composition,
 * 921 unregistered (306 added, 604 modified upstream files, 8 type changes,
 * 3 deleted). `modified` is the decoupling-analysis §6.1 gap (estimated ~605)
 * made machine-readable. The gate fails only when a count EXCEEDS its
 * baseline; when drift shrinks (fork edits upstreamed or registered), lower
 * the matching number here in the same PR so the ratchet holds.
 */
const UNREGISTERED_BASELINE = { total: 921, modified: 604 };

const packageDirPrefixes = DESKTOP_PACKAGES.map((pkg) => `${pkg.dir}/`);
const compositionFiles = new Set(COMPOSITION_ROWS.map((row) => row.file));
const markedFiles = new Set(FORK_FILE_MARKERS.map((marker) => marker.file));

/**
 * @param {string} relPath path relative to the vendor root, forward slashes
 * @returns {'registered-package'|'marked-file'|'composition'|'unregistered'}
 */
function classifyPath(relPath) {
  if (packageDirPrefixes.some((prefix) => relPath.startsWith(prefix))) {
    return 'registered-package';
  }
  if (compositionFiles.has(relPath)) {
    return 'composition';
  }
  if (markedFiles.has(relPath)) {
    return 'marked-file';
  }
  return 'unregistered';
}

/**
 * Parse NUL-separated `git diff-tree -r -z --name-status` output into
 * { status, path } entries. Statuses are single letters (A/M/D/T…); rename
 * detection is off between plain trees so no R scores appear.
 *
 * @param {string} raw
 * @returns {{ status: string, path: string }[]}
 */
function parseNameStatusZ(raw) {
  const tokens = raw.split('\0').filter((token) => token !== '');
  if (tokens.length % 2 !== 0) {
    throw new Error(`name-status stream has ${tokens.length} tokens; expected status/path pairs`);
  }
  const entries = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const status = tokens[i];
    if (!/^[A-Z]$/.test(status)) {
      throw new Error(`unexpected diff status ${JSON.stringify(status)} for ${tokens[i + 1]}`);
    }
    entries.push({ status, path: tokens[i + 1] });
  }
  return entries;
}

/**
 * @param {{ status: string, path: string }[]} entries
 * @returns {{
 *   total: number,
 *   counts: Record<string, number>,
 *   unregistered: { total: number, byStatus: Record<string, number>, entries: { status: string, path: string }[] },
 * }}
 */
function buildReport(entries) {
  const counts = Object.fromEntries(BUCKETS.map((bucket) => [bucket, 0]));
  const unregistered = [];
  for (const entry of entries) {
    const bucket = classifyPath(entry.path);
    counts[bucket] += 1;
    if (bucket === 'unregistered') {
      unregistered.push(entry);
    }
  }
  const byStatus = {};
  for (const entry of unregistered) {
    byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
  }
  return {
    total: entries.length,
    counts,
    unregistered: { total: unregistered.length, byStatus, entries: unregistered },
  };
}

/**
 * Top directories carrying unregistered drift (packages keyed at
 * packages/<group>/<name>, everything else at its first two segments).
 *
 * @param {{ status: string, path: string }[]} entries
 * @param {number} [limit]
 * @returns {{ dir: string, count: number }[]}
 */
function unregisteredHotspots(entries, limit = 15) {
  const counts = new Map();
  for (const entry of entries) {
    const parts = entry.path.split('/');
    const depth = parts[0] === 'packages' ? 3 : 2;
    const key = parts.slice(0, Math.min(depth, parts.length)).join('/');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([dir, count]) => ({ dir, count }))
    .sort((a, b) => b.count - a.count || a.dir.localeCompare(b.dir))
    .slice(0, limit);
}

/**
 * Ratchet verdict: fail when unregistered drift exceeds the recorded
 * baseline; flag (without failing) when it shrank so the baseline gets
 * lowered.
 *
 * @param {{ unregistered: { total: number, byStatus: Record<string, number> } }} report
 * @param {{ total: number, modified: number }} [baseline]
 * @returns {{ ok: boolean, failures: string[], improvements: string[] }}
 */
function evaluateBaseline(report, baseline = UNREGISTERED_BASELINE) {
  const failures = [];
  const improvements = [];
  const total = report.unregistered.total;
  const modified = report.unregistered.byStatus.M || 0;
  if (total > baseline.total) {
    failures.push(`unregistered paths grew: ${total} > baseline ${baseline.total} — register the new fork surface in src/shared/harness-desktop-forks.js (DESKTOP_PACKAGES / FORK_FILE_MARKERS / COMPOSITION_ROWS) or revert the vendor drift`);
  } else if (total < baseline.total) {
    improvements.push(`unregistered paths shrank: ${total} < baseline ${baseline.total} — lower UNREGISTERED_BASELINE.total in src/shared/harness-fork-delta.js to hold the ratchet`);
  }
  if (modified > baseline.modified) {
    failures.push(`unregistered modified upstream files grew: ${modified} > baseline ${baseline.modified}`);
  } else if (modified < baseline.modified) {
    improvements.push(`unregistered modified upstream files shrank: ${modified} < baseline ${baseline.modified} — lower UNREGISTERED_BASELINE.modified`);
  }
  return { ok: failures.length === 0, failures, improvements };
}

module.exports = {
  BUCKETS,
  UNREGISTERED_BASELINE,
  classifyPath,
  parseNameStatusZ,
  buildReport,
  unregisteredHotspots,
  evaluateBaseline,
};
