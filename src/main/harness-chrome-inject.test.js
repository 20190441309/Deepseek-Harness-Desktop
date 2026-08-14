const test = require('node:test');
const assert = require('node:assert/strict');
const { dshReservedRight, dshWindowControlsRight } = require('./harness-chrome-inject.js');

test('reservedRight is only window controls when the trailing cluster is empty', () => {
  assert.equal(dshReservedRight(0), dshWindowControlsRight());
  assert.equal(dshReservedRight(undefined), dshWindowControlsRight());
});

test('reservedRight grows by the measured trailing cluster plus a cluster gap', () => {
  const controls = dshWindowControlsRight();
  assert.equal(dshReservedRight(72), controls + 72 + 8);
  assert.ok(dshReservedRight(72) > controls);
});
