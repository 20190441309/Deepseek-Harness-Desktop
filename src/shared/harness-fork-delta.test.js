'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  BUCKETS,
  UNREGISTERED_BASELINE,
  classifyPath,
  parseNameStatusZ,
  buildReport,
  unregisteredHotspots,
  evaluateBaseline,
} = require('./harness-fork-delta');

test('classifyPath sends registered package dirs to registered-package', () => {
  assert.equal(classifyPath('packages/client/ui-titlebar/src/client/Titlebar.tsx'), 'registered-package');
  assert.equal(classifyPath('packages/host/mcp-servers/package.json'), 'registered-package');
  assert.equal(classifyPath('packages/mcp/mcp-servers-file/src/index.ts'), 'registered-package');
});

test('classifyPath does not prefix-match a lookalike sibling directory', () => {
  // 'packages/client/ui-git/' must not swallow 'ui-git-extras'.
  assert.equal(classifyPath('packages/client/ui-git-extras/src/index.ts'), 'unregistered');
  // The bare package dir path itself (no trailing segment) is not a file diff
  // entry, but a same-named file outside the dir stays unregistered.
  assert.equal(classifyPath('packages/client/ui-git.md'), 'unregistered');
});

test('classifyPath sends composition patch files to composition', () => {
  assert.equal(classifyPath('packages/bundle/base/cordis.patch.yml'), 'composition');
  assert.equal(classifyPath('packages/bundle/web-app/cordis.patch.yml'), 'composition');
});

test('classifyPath sends FORK_FILE_MARKERS paths to marked-file', () => {
  assert.equal(classifyPath('apps/cli/src/args.ts'), 'marked-file');
  assert.equal(classifyPath('packages/client/ui-primitives/src/index.ts'), 'marked-file');
  assert.equal(classifyPath('package.json'), 'marked-file');
});

test('classifyPath defaults to unregistered', () => {
  assert.equal(classifyPath('apps/web/src/main.tsx'), 'unregistered');
  assert.equal(classifyPath('.agents/notes/implemented/feature/x.md'), 'unregistered');
});

test('parseNameStatusZ parses NUL-separated status/path pairs', () => {
  const raw = 'M\0apps/web/src/main.tsx\0A\0packages/client/ui-git/src/new.ts\0D\0old.txt\0';
  assert.deepEqual(parseNameStatusZ(raw), [
    { status: 'M', path: 'apps/web/src/main.tsx' },
    { status: 'A', path: 'packages/client/ui-git/src/new.ts' },
    { status: 'D', path: 'old.txt' },
  ]);
});

test('parseNameStatusZ rejects odd token streams and non-letter statuses', () => {
  assert.throws(() => parseNameStatusZ('M\0only-status-then-nothing\0M\0'), /pairs/);
  assert.throws(() => parseNameStatusZ('R100\0a\0'), /unexpected diff status/);
});

test('buildReport counts every bucket and collects unregistered entries', () => {
  const report = buildReport([
    { status: 'A', path: 'packages/client/ui-titlebar/src/index.ts' },
    { status: 'M', path: 'packages/bundle/web-app/cordis.patch.yml' },
    { status: 'M', path: 'apps/cli/src/args.ts' },
    { status: 'M', path: 'apps/web/src/main.tsx' },
    { status: 'A', path: 'apps/web/src/desktop-extra.tsx' },
    { status: 'T', path: 'CLAUDE.md' },
  ]);
  assert.equal(report.total, 6);
  assert.deepEqual(report.counts, {
    'registered-package': 1,
    'marked-file': 1,
    composition: 1,
    unregistered: 3,
  });
  assert.deepEqual(report.unregistered.byStatus, { M: 1, A: 1, T: 1 });
  assert.deepEqual(report.unregistered.entries.map((entry) => entry.path), [
    'apps/web/src/main.tsx',
    'apps/web/src/desktop-extra.tsx',
    'CLAUDE.md',
  ]);
});

test('unregisteredHotspots groups packages three segments deep, others two', () => {
  const hotspots = unregisteredHotspots([
    { status: 'M', path: 'packages/client/ui-conversation/src/a.tsx' },
    { status: 'M', path: 'packages/client/ui-conversation/tests/b.spec.tsx' },
    { status: 'M', path: 'apps/web/src/main.tsx' },
    { status: 'T', path: 'CLAUDE.md' },
  ]);
  assert.deepEqual(hotspots, [
    { dir: 'packages/client/ui-conversation', count: 2 },
    { dir: 'CLAUDE.md', count: 1 },
    { dir: 'apps/web', count: 1 },
  ]);
});

test('evaluateBaseline passes at the baseline and fails above it', () => {
  const atBaseline = evaluateBaseline(
    { unregistered: { total: 10, byStatus: { M: 6, A: 4 } } },
    { total: 10, modified: 6 },
  );
  assert.equal(atBaseline.ok, true);
  assert.deepEqual(atBaseline.failures, []);
  assert.deepEqual(atBaseline.improvements, []);

  const grewTotal = evaluateBaseline(
    { unregistered: { total: 11, byStatus: { M: 6, A: 5 } } },
    { total: 10, modified: 6 },
  );
  assert.equal(grewTotal.ok, false);
  assert.match(grewTotal.failures[0], /11 > baseline 10/);

  const grewModified = evaluateBaseline(
    { unregistered: { total: 10, byStatus: { M: 7, A: 3 } } },
    { total: 10, modified: 6 },
  );
  assert.equal(grewModified.ok, false);
  assert.match(grewModified.failures[0], /7 > baseline 6/);
});

test('evaluateBaseline reports improvements without failing', () => {
  const shrank = evaluateBaseline(
    { unregistered: { total: 8, byStatus: { M: 5, A: 3 } } },
    { total: 10, modified: 6 },
  );
  assert.equal(shrank.ok, true);
  assert.equal(shrank.improvements.length, 2);
  assert.match(shrank.improvements[0], /lower UNREGISTERED_BASELINE.total/);
});

test('baseline constants stay in the documented shape', () => {
  assert.deepEqual(BUCKETS, ['registered-package', 'marked-file', 'composition', 'unregistered']);
  assert.equal(typeof UNREGISTERED_BASELINE.total, 'number');
  assert.equal(typeof UNREGISTERED_BASELINE.modified, 'number');
  assert.ok(UNREGISTERED_BASELINE.modified <= UNREGISTERED_BASELINE.total);
});
