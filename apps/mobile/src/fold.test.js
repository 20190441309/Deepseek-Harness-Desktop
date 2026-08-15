const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionTitle, foldMuxMessage, rpcEnvelope, respondEnvelope } = require('./fold');

test('prefers a projection title then falls back to the session id', () => {
  assert.equal(sessionTitle({ projections: { title: '周报' } }), '周报');
  assert.equal(sessionTitle({ sessionId: 'abcdef1234' }), 'abcdef12');
});

test('folds approval requests and assistant text from mux frames', () => {
  const withApproval = foldMuxMessage({ events: [], approvals: [] }, {
    type: 'server-request',
    rpcId: 'r1',
    method: 'approval',
    payload: { sessionId: 's1', approvalId: 'a1', tool: 'bash', command: 'ls' },
  });
  assert.equal(withApproval.approvals[0].approvalId, 'a1');
  const withText = foldMuxMessage(withApproval, JSON.stringify({
    payload: { type: 'assistant', text: 'done' },
  }));
  assert.equal(withText.events[0].text, 'done');
});

test('builds RPC and respond envelopes', () => {
  assert.equal(rpcEnvelope('session.list', {}).type, 'client-request');
  assert.deepEqual(respondEnvelope('r1', { outcome: 'allowed-once' }).result.value.outcome, 'allowed-once');
});
