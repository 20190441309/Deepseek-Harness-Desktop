'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertReleaseQaResult,
  QA_REQUIRED_STEPS,
  PAGE_HELPERS,
} = require('./release-ui-walk');

test('assertReleaseQaResult passes when every required step is present and ok', () => {
  const steps = QA_REQUIRED_STEPS.map((name) => ({ name, ok: true, detail: '' }));
  steps.push({ name: 'gallery.items', ok: false, optional: true, detail: 'network' });
  assert.doesNotThrow(() => assertReleaseQaResult({
    qa: { ok: true, failed: [], steps },
  }));
});

test('assertReleaseQaResult fails on a required step miss or omission', () => {
  assert.throws(
    () => assertReleaseQaResult({ qa: { ok: false, failed: ['files.panel'], steps: [] } }),
    /files\.panel/,
  );
  const steps = QA_REQUIRED_STEPS
    .filter((name) => name !== 'plugin.dshbot.tabAbsent')
    .map((name) => ({ name, ok: true, detail: '' }));
  assert.throws(
    () => assertReleaseQaResult({ qa: { ok: true, failed: [], steps } }),
    /plugin\.dshbot\.tabAbsent/,
  );
});

test('release walk helpers stay injectable into the harness page', () => {
  assert.match(PAGE_HELPERS, /function dshShown/);
  assert.match(PAGE_HELPERS, /function dshFind/);
  assert.match(PAGE_HELPERS, /function dshSetValue/);
  assert.match(PAGE_HELPERS, /function dshDialogNamed/);
  assert.ok(QA_REQUIRED_STEPS.includes('workspace.connected'));
  assert.ok(QA_REQUIRED_STEPS.includes('workspace.picker'));
  assert.ok(QA_REQUIRED_STEPS.includes('gallery.sources'));
  assert.ok(QA_REQUIRED_STEPS.includes('market.discover'));
  assert.ok(QA_REQUIRED_STEPS.includes('browser.url'));
  assert.ok(QA_REQUIRED_STEPS.includes('plugin.dshbot.tabAbsent'));
  assert.equal(QA_REQUIRED_STEPS.includes('plugin.dshbot.tab'), false);
  assert.ok(QA_REQUIRED_STEPS.includes('market.installed'));
  assert.ok(QA_REQUIRED_STEPS.includes('files.mentionAppended'));
  assert.ok(QA_REQUIRED_STEPS.includes('files.mentionVisible'));
  assert.ok(QA_REQUIRED_STEPS.includes('composer.skillMenuAbsent'));
  assert.ok(QA_REQUIRED_STEPS.includes('composer.pathSourceAbsent'));
  assert.ok(QA_REQUIRED_STEPS.includes('remote.available'));
  assert.ok(QA_REQUIRED_STEPS.includes('remote.notListening'));
});

test('release walk source clicks Mention and asserts the composer markdown link', () => {
  const walk = require('node:fs').readFileSync(
    require('node:path').join(__dirname, 'release-ui-walk.js'),
    'utf8',
  );
  assert.match(walk, /files\.mentionAppended/);
  assert.match(walk, /mention in composer\|引用到输入框/);
  assert.match(walk, /\\\[note\\\.md\\\]\\\(note\\\.md\\\)/);
  assert.match(walk, /composer\.skillMenuAbsent/);
  assert.match(walk, /composer\.pathSourceAbsent/);
  assert.match(walk, /data-source="path"/);
  assert.match(walk, /probeRemote/);
  assert.match(walk, /remote\.available/);
  assert.match(walk, /summarizeRemoteQaDetail/);
  assert.doesNotMatch(walk, /JSON\.stringify\(remoteSnap\)/);
  assert.match(walk, /\$fo/);
});
