import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionTitle } from './title.js';

test('sessionTitle prefers blank then projection then short id', () => {
  assert.equal(sessionTitle({ sessionId: 'abcdefghij', blank: true }), '新会话');
  assert.equal(sessionTitle({
    sessionId: 'abcdefghij',
    blank: false,
    projections: { values: { title: '修远程' } },
  }), '修远程');
  assert.equal(sessionTitle({ sessionId: 'abcdefghij', blank: false }), 'abcdefg');
});
