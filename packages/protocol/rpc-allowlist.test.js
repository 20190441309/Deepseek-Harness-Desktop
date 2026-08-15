const test = require('node:test');
const assert = require('node:assert/strict');
const { isRpcAllowed } = require('./rpc-allowlist');

test('allows office RPCs and event streams', () => {
  assert.equal(isRpcAllowed('session.list'), true);
  assert.equal(isRpcAllowed('/api/session.prompt'), true);
  assert.equal(isRpcAllowed('/api/respond'), true);
  assert.equal(isRpcAllowed('/api/events.mux'), true);
  assert.equal(isRpcAllowed('host.describe'), true);
});

test('denies privileged configuration and host desktop actions', () => {
  assert.equal(isRpcAllowed('settings.describe'), false);
  assert.equal(isRpcAllowed('settings.update'), false);
  assert.equal(isRpcAllowed('credentials.set'), false);
  assert.equal(isRpcAllowed('host.pickDirectory'), false);
  assert.equal(isRpcAllowed('/api/host.openPath'), false);
  assert.equal(isRpcAllowed('agentPreset.read'), false);
  assert.equal(isRpcAllowed('llm.discoverModels'), false);
});
