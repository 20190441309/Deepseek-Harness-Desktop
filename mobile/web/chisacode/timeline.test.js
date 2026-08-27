import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchOlderTimeline, mergeOlderEntries, timelinePageInfo } from './timeline.js';

test('timelinePageInfo extracts the older edge and requires a usable cursor', () => {
  assert.deepEqual(
    timelinePageInfo({ startCursor: { epoch: 'e1', seq: 12 }, hasOlder: true }),
    { startCursor: { epoch: 'e1', seq: 12 }, hasOlder: true },
  );
  // hasOlder without a valid cursor cannot be paged — report done.
  assert.deepEqual(
    timelinePageInfo({ startCursor: null, hasOlder: true }),
    { startCursor: null, hasOlder: false },
  );
  assert.deepEqual(
    timelinePageInfo({ startCursor: { epoch: 'e1', seq: -1 }, hasOlder: true }),
    { startCursor: null, hasOlder: false },
  );
  assert.deepEqual(timelinePageInfo(undefined), { startCursor: null, hasOlder: false });
});

test('fetchOlderTimeline requests the before-window with the cursor', async () => {
  const calls = [];
  const client = {
    async fetchAgentTimeline(agentId, options) {
      calls.push([agentId, options]);
      return { entries: [], hasOlder: false, startCursor: null };
    },
  };
  await fetchOlderTimeline(client, 'a1', { epoch: 'e1', seq: 30 }, { limit: 50 });
  assert.deepEqual(calls, [['a1', {
    direction: 'before',
    cursor: { epoch: 'e1', seq: 30 },
    limit: 50,
    projection: 'projected',
  }]]);
});

test('fetchOlderTimeline rejects a missing cursor and surfaces payload errors', async () => {
  await assert.rejects(() => fetchOlderTimeline({}, 'a1', null), /没有可用的历史游标/);
  const client = {
    async fetchAgentTimeline() {
      return { error: 'agent not loaded' };
    },
  };
  await assert.rejects(
    () => fetchOlderTimeline(client, 'a1', { epoch: 'e1', seq: 3 }),
    /agent not loaded/,
  );
});

test('mergeOlderEntries prepends and drops seq ranges already rendered', () => {
  const current = [
    { seqStart: 10, seqEnd: 10, item: { type: 'user_message', text: 'kept-current' } },
    { seqStart: 11, seqEnd: 12 },
  ];
  const older = [
    { seqStart: 8, seqEnd: 8 },
    { seqStart: 10, seqEnd: 10, item: { type: 'user_message', text: 'dup' } },
    { seqStart: 9, seqEnd: 9 },
  ];
  const merged = mergeOlderEntries(older, current);
  assert.deepEqual(merged.map((entry) => entry.seqStart), [8, 9, 10, 11]);
  // The newer projection wins on the duplicate seq.
  assert.equal(merged[2].item.text, 'kept-current');
});

test('mergeOlderEntries keeps keyless entries instead of hiding rows', () => {
  const merged = mergeOlderEntries([{ item: { type: 'error' } }], [{ seqStart: 5 }]);
  assert.equal(merged.length, 2);
});
