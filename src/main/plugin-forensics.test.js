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

test('inspectPlugins flags suspects and presets without deleting the latter', () => {
  const inspected = inspectPlugins({
    logs: 'cannot resolve profile bundle "evil-pack"',
    plugins: [
      { name: 'dshmarket', spec: 'file:vendor' },
      { name: 'evil-pack', spec: '1.0.0' },
    ],
    bundles: ['dshmarket', 'evil-pack'],
    disabledPlugins: ['evil-pack'],
  });
  assert.equal(inspected.plugins.find((row) => row.name === 'dshmarket').preset, true);
  assert.equal(inspected.plugins.find((row) => row.name === 'evil-pack').suspect, true);
  assert.equal(inspected.plugins.find((row) => row.name === 'evil-pack').disabled, true);
  assert.equal(isPresetPlugin('dsh-usage-panel'), true);
  // dshbot is a standalone user plugin now, so forensics may suspect/disable it.
  assert.equal(isPresetPlugin('dshbot'), false);
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
