'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  shouldShowRecovery,
  recoveryVerdict,
  sortPluginRows,
  pluginErrorLabel,
} = require('./launcher-recovery');

test('shouldShowRecovery covers sticky skip, last failure, suspects, and generic causes', () => {
  assert.equal(shouldShowRecovery(null, { skipUserPlugins: true }, null, null), true);
  assert.equal(shouldShowRecovery({ ok: false, error: 'boom' }, null, null, null), true);
  assert.equal(shouldShowRecovery(null, null, { genericCause: 'oom' }, null), true);
  assert.equal(shouldShowRecovery(null, null, { suspects: [{ name: 'evil' }] }, null), true);
  assert.equal(shouldShowRecovery(null, null, null, { state: 'error' }), true);
  assert.equal(shouldShowRecovery({ ok: null }, null, { plugins: [] }, { state: 'ready' }), false);
});

test('recoveryVerdict explains sticky skip and suspects', () => {
  assert.match(
    recoveryVerdict(null, { skipUserPlugins: true }, null),
    /跳过用户插件/,
  );
  assert.match(
    recoveryVerdict(null, null, { suspects: [{ name: 'evil-pack' }] }),
    /evil-pack/,
  );
  assert.match(
    recoveryVerdict({ ok: false, error: 'tree failed' }, null, null),
    /上次启动失败/,
  );
});

test('sortPluginRows prioritizes orphans and suspects', () => {
  const rows = sortPluginRows([
    { name: 'zeta', suspect: false },
    { name: 'alpha', suspect: true },
    { name: 'orphan', orphan: true, suspect: true },
  ]);
  assert.deepEqual(rows.map((row) => row.name), ['orphan', 'alpha', 'zeta']);
});

test('pluginErrorLabel maps known codes', () => {
  assert.equal(pluginErrorLabel('official-template'), '官方模板插件不可禁用。');
  assert.equal(pluginErrorLabel('unknown-code'), 'unknown-code');
});
