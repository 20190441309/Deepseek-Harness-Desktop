'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  classifyGenericFailure,
  extractSuspectNames,
  extractEvidence,
  buildForensicsSummary,
  inspectPlugins,
  isPresetPlugin,
  isInBoxPackageName,
} = require('./plugin-forensics');

test('extractSuspectNames reads bundle, package, and compose failures', () => {
  const text = [
    'cannot resolve profile bundle "evil-pack"',
    "Cannot find package 'missing-mod'",
    'ERR_MODULE_NOT_FOUND: Cannot find package "@acme/broken"',
    'failed to compose client package "@acme/compose"',
  ].join('\n');
  assert.deepEqual(extractSuspectNames(text).sort(), [
    '@acme/broken',
    '@acme/compose',
    'evil-pack',
    'missing-mod',
  ]);
});

test('generic crashes are not blamed on a plugin', () => {
  assert.equal(classifyGenericFailure('FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory'), 'oom');
  assert.equal(classifyGenericFailure('listen EADDRINUSE: address already in use 127.0.0.1:3080'), 'port-in-use');
  assert.equal(classifyGenericFailure("'node' is not recognized as an internal or external command"), 'missing-node');
  const inspected = inspectPlugins({
    logs: 'heap out of memory\ncannot resolve profile bundle "evil-pack"',
    plugins: [{ name: 'evil-pack', spec: '1.0.0' }],
    bundles: ['evil-pack'],
  });
  assert.equal(inspected.genericCause, 'oom');
  assert.deepEqual(inspected.suspects, []);
  assert.equal(inspected.plugins[0].suspect, false);
});

test('inspectPlugins flags suspects and in-box built-ins without preset toggles', () => {
  const inspected = inspectPlugins({
    logs: 'cannot resolve profile bundle "evil-pack"',
    plugins: [
      { name: 'dsh-usage-panel', spec: 'file:vendor' },
      { name: 'evil-pack', spec: '1.0.0' },
    ],
    bundles: ['dsh-usage-panel', 'evil-pack'],
    disabledPlugins: ['evil-pack'],
  });
  assert.equal(inspected.plugins.find((row) => row.name === 'dsh-usage-panel').inBox, true);
  assert.equal(inspected.plugins.find((row) => row.name === 'dsh-usage-panel').preset, false);
  assert.equal(inspected.plugins.find((row) => row.name === 'evil-pack').suspect, true);
  assert.equal(inspected.plugins.find((row) => row.name === 'evil-pack').disabled, true);
  assert.equal(isPresetPlugin('dsh-usage-panel'), false);
  assert.equal(isPresetPlugin('dshbot'), false);
  assert.equal(isPresetPlugin('dshmarket'), false);
  assert.equal(isPresetPlugin('evil-pack'), false);
});

test('inspectPlugins surfaces orphan suspects, evidence, and summary', () => {
  const inspected = inspectPlugins({
    logs: 'cannot resolve profile bundle "ghost-pack"',
    lastStartError: 'failed to compose client package "@acme/broken"',
    pluginTreeFailure: true,
    recovery: { skipUserPlugins: true, reason: 'test', at: '2026-01-01', appVersion: '1.0.0' },
    plugins: [{ name: 'good', spec: '1.0.0' }],
    bundles: ['good'],
  });
  assert.equal(inspected.orphanSuspects.length, 2);
  assert.ok(inspected.evidence.length >= 2);
  assert.equal(inspected.recovery.skipUserPlugins, true);
  assert.equal(inspected.pluginTreeFailure, true);
  assert.equal(inspected.summary.suspectCount, 4);
  assert.equal(inspected.summary.hasOrphans, true);
  assert.deepEqual(buildForensicsSummary(inspected).suspectCount, 4);
});

test('in-box fork package suspects are flagged as desktop runtime damage', () => {
  assert.equal(isInBoxPackageName('@deepseek-ai/dsh-client-ui-settings-market'), true);
  assert.equal(isInBoxPackageName('@deepseek-ai/dsh-client-ui-settings-market/client'), true);
  assert.equal(isInBoxPackageName('@acme/unrelated'), false);

  const inspected = inspectPlugins({
    logs: "Cannot find package '@deepseek-ai/dsh-client-ui-settings-market' imported from /profiles/web/",
    pluginTreeFailure: true,
    plugins: [{ name: 'good', spec: '1.0.0' }],
    bundles: ['good'],
  });
  assert.equal(inspected.desktopRuntimeDamage, true);
  assert.equal(inspected.summary.desktopRuntimeDamage, true);
  const row = inspected.orphanSuspects.find(
    (item) => item.name === '@deepseek-ai/dsh-client-ui-settings-market',
  );
  assert.equal(row.inBox, true);
  assert.equal(row.orphan, true);
});

test('a profile plugin shadowing an in-box name is flagged in-box on the row', () => {
  const inspected = inspectPlugins({
    logs: "Cannot find package '@deepseek-ai/dsh-client-ui-settings-market'",
    plugins: [{ name: '@deepseek-ai/dsh-client-ui-settings-market', spec: '1.0.0' }],
    bundles: [],
  });
  assert.equal(inspected.desktopRuntimeDamage, false);
  assert.equal(inspected.orphanSuspects.length, 0);
  assert.equal(inspected.plugins[0].suspect, true);
  assert.equal(inspected.plugins[0].inBox, true);
});

test('non in-box orphans do not raise the runtime damage flag', () => {
  const inspected = inspectPlugins({
    logs: 'cannot resolve profile bundle "ghost-pack"',
    plugins: [],
    bundles: [],
  });
  assert.equal(inspected.desktopRuntimeDamage, false);
  assert.equal(inspected.orphanSuspects[0].inBox, false);
});
