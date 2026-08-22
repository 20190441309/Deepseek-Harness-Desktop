'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  COMPOSER_OFFICIAL_CASES,
  SESSIONS_INJECT_TRIPWIRE,
  assertComposerOfficialQaResult,
} = require('./composer-official-qa');

test('composer official cases cover the plan claims', () => {
  const ids = COMPOSER_OFFICIAL_CASES.map((c) => c.id);
  assert.ok(ids.includes('case.mention.writesMarkdown'));
  assert.ok(ids.includes('case.mention.noSessionsCrash'));
  assert.ok(ids.includes('case.preview.addToChat'));
  assert.ok(ids.includes('case.dollar.noLocalSkillMenu'));
  assert.ok(ids.includes('case.at.noDesktopPathSource'));
  assert.ok(ids.includes('case.terminal.addToChat'));
  assert.ok(ids.includes('case.remote.available'));
  assert.ok(ids.includes('case.remote.listening'));
  assert.equal(new Set(ids).size, ids.length);
});

test('sessions inject tripwire matches the live crash text', () => {
  assert.match(
    'Uncaught Error: cannot get property "sessions" without inject',
    SESSIONS_INJECT_TRIPWIRE,
  );
  assert.doesNotMatch('Uncaught TypeError: something else', SESSIONS_INJECT_TRIPWIRE);
});

test('assertComposerOfficialQaResult rejects missing or failed cases', () => {
  assert.throws(
    () => assertComposerOfficialQaResult({ ok: false, failed: ['case.mention.writesMarkdown'], steps: [] }),
    /case\.mention\.writesMarkdown/,
  );
  const steps = COMPOSER_OFFICIAL_CASES
    .filter((c) => c.id !== 'case.remote.listening')
    .map((c) => ({ name: c.id, ok: true, detail: '' }));
  assert.throws(
    () => assertComposerOfficialQaResult({ ok: true, failed: [], steps }),
    /case\.remote\.listening/,
  );
  assert.doesNotThrow(() => assertComposerOfficialQaResult({
    ok: true,
    failed: [],
    steps: COMPOSER_OFFICIAL_CASES.map((c) => ({ name: c.id, ok: true, detail: '' })),
  }));
});

test('composer official QA module is wired into the main process smoke path', () => {
  const index = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  assert.match(index, /runComposerOfficialQa/);
  assert.match(index, /DSH_QA_COMPOSER/);
  const runner = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'run-composer-official-qa.mjs'), 'utf8');
  assert.match(runner, /DSH_QA_COMPOSER/);
  assert.match(runner, /remoteEnabled:\s*true/);
  assert.match(runner, /assertComposerOfficialQaResult/);
});
