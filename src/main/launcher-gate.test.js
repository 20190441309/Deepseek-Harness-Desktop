'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  shouldPromptUpdate,
  shouldAutoStartDesktop,
  shouldCloseLauncher,
  readLastDesktopStart,
  writeLastDesktopStart,
} = require('./launcher-gate');

test('shouldPromptUpdate asks only for a newer non-error check when the setting is on', () => {
  assert.equal(shouldPromptUpdate({ askOnUpdate: true, check: { status: 'available' } }), true);
  assert.equal(shouldPromptUpdate({ askOnUpdate: false, check: { status: 'available' } }), false);
  assert.equal(shouldPromptUpdate({ askOnUpdate: true, check: { status: 'current' } }), false);
  assert.equal(shouldPromptUpdate({ askOnUpdate: true, check: { status: 'error' } }), false);
});

test('shouldAutoStartDesktop yields to import hold, update prompt, and last failure', () => {
  assert.equal(shouldAutoStartDesktop({ autoStartDesktop: true }), true);
  assert.equal(shouldAutoStartDesktop({ autoStartDesktop: false }), false);
  assert.equal(shouldAutoStartDesktop({ autoStartDesktop: true, holdForImport: true }), false);
  assert.equal(shouldAutoStartDesktop({ autoStartDesktop: true, updatePromptPending: true }), false);
  assert.equal(shouldAutoStartDesktop({ autoStartDesktop: true, lastStartFailed: true }), false);
});

test('shouldCloseLauncher only after a successful desktop start when quit-after-start is on', () => {
  assert.equal(shouldCloseLauncher({ desktopReady: true, quitAfterStart: true }), true);
  assert.equal(shouldCloseLauncher({ desktopReady: true, quitAfterStart: false }), false);
  assert.equal(shouldCloseLauncher({ desktopReady: false, quitAfterStart: true }), false);
});

test('last desktop start file records failure for the next cold start', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-last-start-'));
  assert.equal(readLastDesktopStart(dir).ok, true);
  writeLastDesktopStart(dir, { ok: false, error: 'plugin tree' });
  const last = readLastDesktopStart(dir);
  assert.equal(last.ok, false);
  assert.equal(last.error, 'plugin tree');
  writeLastDesktopStart(dir, { ok: true });
  assert.equal(readLastDesktopStart(dir).ok, true);
  fs.rmSync(dir, { recursive: true, force: true });
});
