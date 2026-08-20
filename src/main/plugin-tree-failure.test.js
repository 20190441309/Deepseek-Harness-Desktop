'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isPluginTreeFailure } = require('./plugin-tree-failure');

test('isPluginTreeFailure matches composition diagnostics', () => {
  assert.equal(isPluginTreeFailure('plugin tree failed to load'), true);
  assert.equal(isPluginTreeFailure('cannot resolve profile bundle "ghost"'), true);
  assert.equal(isPluginTreeFailure('failed to apply loader entry tools'), true);
  assert.equal(isPluginTreeFailure('entries did not activate'), true);
  assert.equal(isPluginTreeFailure('client-modules: ClientPackageCompositionError'), true);
  assert.equal(isPluginTreeFailure('client-modules: composition failed'), true);
  assert.equal(isPluginTreeFailure('client-modules: 1 client package(s) failed to compose:'), true);
  assert.equal(isPluginTreeFailure('client-modules: 组合失败'), true);
  assert.equal(isPluginTreeFailure('client-modules: 组成失败'), false);
  assert.equal(isPluginTreeFailure('client-modules: bundle route'), false);
  assert.equal(isPluginTreeFailure('listen EADDRINUSE: address already in use'), false);
  assert.equal(isPluginTreeFailure(''), false);
});
