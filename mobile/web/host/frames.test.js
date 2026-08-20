import test from 'node:test';
import assert from 'node:assert/strict';
import { applyHostFrame, hostLabel } from './frames.js';

test('hostLabel uses cwd folder then 已连接', () => {
  assert.equal(hostLabel({ cwd: 'C:\\Ai\\Deepseek-Harness-Desktop' }), 'Deepseek-Harness-Desktop');
  assert.equal(hostLabel({ cwd: '/tmp/work' }), 'work');
  assert.equal(hostLabel({}), '已连接');
});

test('applyHostFrame adds, updates running, and removes sessions', () => {
  let rows = [];
  rows = applyHostFrame(rows, {
    type: 'host/session-added',
    sessionId: 's1',
    blank: true,
  });
  assert.equal(rows[0].sessionId, 's1');
  assert.equal(rows[0].blank, true);
  rows = applyHostFrame(rows, { type: 'host/session-status', sessionId: 's1', running: true });
  assert.equal(rows[0].running, true);
  rows = applyHostFrame(rows, { type: 'host/session-removed', sessionId: 's1' });
  assert.equal(rows.length, 0);
});
