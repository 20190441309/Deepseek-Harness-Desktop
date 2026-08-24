'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { qaDriversAllowed, qaFlag } = require('./qa-gate');

test('source runs honor QA flags without an extra switch', () => {
  assert.equal(qaDriversAllowed({ isPackaged: false, env: {} }), true);
  assert.equal(qaFlag('DSH_QA', { isPackaged: false, env: { DSH_QA: '1' } }), true);
  assert.equal(qaFlag('DSH_QA', { isPackaged: false, env: {} }), false);
  assert.equal(qaFlag('DSH_QA', { isPackaged: false, env: { DSH_QA: 'yes' } }), false);
});

test('packaged runs ignore ambient QA flags unless DSHD_ALLOW_PACKAGED_QA=1', () => {
  assert.equal(qaDriversAllowed({ isPackaged: true, env: {} }), false);
  assert.equal(qaFlag('DSH_QA_SHELL', { isPackaged: true, env: { DSH_QA_SHELL: '1' } }), false);
  assert.equal(qaFlag('DSH_SMOKE', { isPackaged: true, env: { DSH_SMOKE: '1' } }), false);
  assert.equal(
    qaFlag('DSH_QA_SHELL', {
      isPackaged: true,
      env: { DSH_QA_SHELL: '1', DSHD_ALLOW_PACKAGED_QA: '1' },
    }),
    true,
  );
});

test('index.js consumes QA env only through the gate and loads QA drivers lazily', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  // No top-level (column-0) requires of the QA driver modules: they must not
  // ship resident in the production main process.
  for (const mod of [
    'release-ui-walk',
    'composer-official-qa',
    'appendix-a-qa',
    'shell-p0-qa',
    'packaged-p0',
  ]) {
    assert.doesNotMatch(
      source,
      new RegExp(`^const .*require\\('\\./${mod}'\\)`, 'm'),
      `${mod} must be required lazily inside the smoke path`,
    );
    assert.match(source, new RegExp(`require\\('\\./${mod}'\\)`));
  }
  // Raw env reads of the QA flags would bypass the packaged gate.
  assert.doesNotMatch(source, /process\.env\.DSH_QA[A-Z_]*\s*===\s*'1'/);
  assert.doesNotMatch(source, /process\.env\.DSH_SMOKE\s*===\s*'1'/);
  assert.doesNotMatch(source, /process\.env\.DSH_THEME_SMOKE\s*===\s*'1'/);
  assert.match(source, /require\('\.\/qa-gate'\)/);
});

test('packaged QA rehearsal scripts opt in explicitly', () => {
  const root = path.join(__dirname, '..', '..');
  for (const script of ['run-packaged-smoke.mjs', 'run-packaged-p0.mjs']) {
    const source = fs.readFileSync(path.join(root, 'scripts', script), 'utf8');
    assert.match(source, /DSHD_ALLOW_PACKAGED_QA/, `${script} must set the packaged QA switch`);
  }
});
