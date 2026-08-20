'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  skipStartingCopy,
  startupErrorLabel,
  retryActionLabel,
  downloadLogLabel,
  isImportantBootLog,
} = require('./boot-recovery');

test('skip starting copy matches the spec', () => {
  assert.deepEqual(skipStartingCopy(), {
    status: '正在以官方组合启动',
    hint: '第三方插件导致上次启动失败，已暂时跳过',
  });
});

test('recovery-fail label is 启动失败 and retry stays 重试', () => {
  assert.equal(startupErrorLabel(), '启动失败');
  assert.equal(retryActionLabel(false), '重试');
  assert.equal(retryActionLabel(true), '立即重启');
  assert.equal(downloadLogLabel(), '下载日志');
});

test('boot log filter keeps plugin-tree lines', () => {
  assert.equal(isImportantBootLog('plugin tree failed to load'), true);
  assert.equal(isImportantBootLog('cannot get property "tools" without inject'), true);
  assert.equal(isImportantBootLog('cannot resolve profile bundle "ghost"'), true);
  assert.equal(isImportantBootLog('listening on 127.0.0.1'), false);
});

test('boot.html loads boot-recovery.js before boot.js', () => {
  const html = fs.readFileSync(path.join(__dirname, 'boot.html'), 'utf8');
  const recovery = html.indexOf('src="boot-recovery.js"');
  const boot = html.indexOf('src="boot.js"');
  assert.ok(recovery >= 0);
  assert.ok(boot > recovery);
});
