'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

const {
  DESKTOP_DSH_HOME_DIRNAME,
  desktopDshHomeFromUserData,
  setDesktopDshHome,
  clearDesktopDshHome,
  getDesktopDshHome,
  tryGetDesktopDshHome,
  applyDesktopDshHome,
} = require('./dsh-home');

function withEnv(key, value, work) {
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return work();
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

test.afterEach(() => {
  clearDesktopDshHome();
  delete process.env.DSHD_HOME;
});

test('desktopDshHomeFromUserData joins the short dsh-home directory', () => {
  const userData = path.join(os.tmpdir(), 'Deepseek-Harness-Desktop');
  assert.equal(
    desktopDshHomeFromUserData(userData),
    path.join(userData, DESKTOP_DSH_HOME_DIRNAME),
  );
  assert.equal(DESKTOP_DSH_HOME_DIRNAME, 'dsh-home');
});

test('getDesktopDshHome ignores DSH_HOME and throws when unset', () => {
  withEnv('DSH_HOME', path.join(os.homedir(), '.dsh'), () => {
    assert.equal(tryGetDesktopDshHome(), '');
    assert.throws(() => getDesktopDshHome(), /desktop DSH home is not configured/);
  });
});

test('DSHD_HOME wins over a configured home and DSH_HOME', () => {
  const configured = path.join(os.tmpdir(), 'configured-dsh-home');
  const fromEnv = path.join(os.tmpdir(), 'env-dshd-home');
  setDesktopDshHome(configured);
  withEnv('DSH_HOME', path.join(os.homedir(), '.dsh'), () => {
    withEnv('DSHD_HOME', fromEnv, () => {
      assert.equal(getDesktopDshHome(), path.resolve(fromEnv));
    });
  });
});

test('setDesktopDshHome is used when DSHD_HOME is unset', () => {
  const configured = path.join(os.tmpdir(), 'configured-dsh-home');
  setDesktopDshHome(configured);
  assert.equal(getDesktopDshHome(), path.resolve(configured));
});

test('applyDesktopDshHome overwrites an inherited DSH_HOME', () => {
  const configured = path.join(os.tmpdir(), 'configured-dsh-home');
  setDesktopDshHome(configured);
  const env = applyDesktopDshHome({
    DSH_HOME: path.join(os.homedir(), '.dsh'),
    KEEP: 'yes',
  });
  assert.equal(env.DSH_HOME, path.resolve(configured));
  assert.equal(env.KEEP, 'yes');
});
