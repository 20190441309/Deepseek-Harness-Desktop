const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-config-test-'));
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    app: {
      isPackaged: false,
      getPath(name) {
        if (name === 'userData') return userData;
        if (name === 'documents') return userData;
        return userData;
      },
    },
  },
};

const {
  DEFAULTS,
  loadConfig,
  saveConfig,
  normalizeHarnessRecovery,
} = require('./config');

test.after(() => {
  fs.rmSync(userData, { recursive: true, force: true });
});

test('Harness recovery defaults are bounded and enabled', () => {
  assert.equal(DEFAULTS.harnessAutoRestart, true);
  assert.equal(DEFAULTS.harnessRestartMaxAttempts, 3);
  assert.equal(DEFAULTS.harnessRestartBaseDelayMs, 1000);
  assert.deepEqual(normalizeHarnessRecovery({}), {
    harnessAutoRestart: true,
    harnessRestartMaxAttempts: 3,
    harnessRestartBaseDelayMs: 1000,
  });
});

test('invalid recovery settings fall back to safe defaults', () => {
  const invalid = normalizeHarnessRecovery({
    harnessAutoRestart: 'yes',
    harnessRestartMaxAttempts: 0,
    harnessRestartBaseDelayMs: 90_000,
  });
  assert.equal(invalid.harnessAutoRestart, true);
  assert.equal(invalid.harnessRestartMaxAttempts, 3);
  assert.equal(invalid.harnessRestartBaseDelayMs, 1000);

  assert.equal(normalizeHarnessRecovery({ harnessRestartMaxAttempts: 10 }).harnessRestartMaxAttempts, 10);
  assert.equal(normalizeHarnessRecovery({ harnessRestartBaseDelayMs: 500 }).harnessRestartBaseDelayMs, 500);
  assert.equal(normalizeHarnessRecovery({ harnessRestartBaseDelayMs: 30_000 }).harnessRestartBaseDelayMs, 30_000);
});

test('saveConfig persists normalized recovery settings', () => {
  const saved = saveConfig({
    workspace: userData,
    harnessAutoRestart: false,
    harnessRestartMaxAttempts: 5,
    harnessRestartBaseDelayMs: 2000,
  });
  assert.equal(saved.harnessAutoRestart, false);
  assert.equal(saved.harnessRestartMaxAttempts, 5);
  assert.equal(saved.harnessRestartBaseDelayMs, 2000);

  const loaded = loadConfig();
  assert.equal(loaded.harnessAutoRestart, false);
  assert.equal(loaded.harnessRestartMaxAttempts, 5);
  assert.equal(loaded.harnessRestartBaseDelayMs, 2000);
});

test('saveConfig rejects out-of-range recovery values before writing', () => {
  saveConfig({
    harnessRestartMaxAttempts: 11,
    harnessRestartBaseDelayMs: 499,
  });
  const loaded = loadConfig();
  assert.equal(loaded.harnessRestartMaxAttempts, DEFAULTS.harnessRestartMaxAttempts);
  assert.equal(loaded.harnessRestartBaseDelayMs, DEFAULTS.harnessRestartBaseDelayMs);
});
