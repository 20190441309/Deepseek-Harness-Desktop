import test from 'node:test';
import assert from 'node:assert/strict';
import { foldEvents } from './fold.js';

test('foldEvents builds user, assistant, and tool bubbles', () => {
  const rows = foldEvents([
    {
      event: {
        type: 'user/message',
        seq: 1,
        time: 1,
        data: { id: 'm1', source: { kind: 'user' }, content: [{ type: 'text', text: '你好' }] },
      },
    },
    {
      event: { type: 'assistant/chunk', seq: 2, time: 2, data: { chunk: { type: 'text', text: '帮' } } },
    },
    {
      event: { type: 'assistant/chunk', seq: 3, time: 3, data: { chunk: { type: 'text', text: '你' } } },
    },
    {
      event: {
        type: 'assistant/message',
        seq: 4,
        time: 4,
        data: { message: { content: [{ type: 'text', text: '帮你' }] } },
      },
    },
    {
      event: { type: 'tool/call', seq: 5, time: 5, data: { name: 'read_file', callId: 'c1' } },
      view: { for: 'call', view: { card: 'read_file' } },
    },
  ]);
  assert.equal(rows[0].role, 'user');
  assert.equal(rows[0].text, '你好');
  assert.deepEqual(rows[0].images, []);
  assert.equal(rows[1].role, 'assistant');
  assert.equal(rows[1].text, '帮你');
  assert.equal(rows[2].role, 'tool');
  assert.equal(rows[2].card, 'read_file');
});

// 对应 Android Fold.kt imagesFromBlocks。
test('foldEvents keeps image blocks on user bubbles', () => {
  const rows = foldEvents([
    {
      event: {
        type: 'user/message',
        seq: 1,
        data: {
          id: 'm1',
          source: { kind: 'user' },
          content: [
            { type: 'text', text: '看这张图' },
            { type: 'image', mediaType: 'image/png', data: 'aGk=' },
            { type: 'image', mediaType: 'image/jpeg' },
          ],
        },
      },
    },
  ]);
  assert.equal(rows[0].text, '看这张图');
  assert.deepEqual(rows[0].images, [{ mediaType: 'image/png', data: 'aGk=' }]);
});
