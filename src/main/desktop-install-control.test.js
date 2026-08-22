'use strict';

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const {
  startDesktopInstallControl,
  stopDesktopInstallControl,
  desktopInstallReady,
  desktopInstallEnv,
} = require('./desktop-install-control');
const { DshManager } = require('./dsh');
const { setDesktopDshHome, clearDesktopDshHome } = require('../shared/dsh-home');

async function postInstall(url, token, body) {
  return fetch(new URL('/install', url), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body,
  });
}

describe('desktop install control', { concurrency: false }, () => {
  afterEach(() => {
    stopDesktopInstallControl();
    clearDesktopDshHome();
  });

  test('a successful install responds before Harness restart is scheduled', async () => {
    const order = [];
    startDesktopInstallControl({
      installPlugin: async (spec, options) => {
        order.push(`install:${spec}:${(options.allowBuilds || []).join(',')}`);
        return { ok: true, spec: `${spec}#sha`, log: 'added' };
      },
      startHarness: async () => {
        order.push('restart');
      },
      restartDelayMs: 40,
    });
    const { url, token } = await desktopInstallReady();
    const response = await postInstall(url, token, JSON.stringify({ spec: 'github:owner/repo' }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.spec, 'github:owner/repo#sha');
    assert.deepEqual(order, ['install:github:owner/repo:']);
    await new Promise((resolve) => setTimeout(resolve, 70));
    assert.deepEqual(order, ['install:github:owner/repo:', 'restart']);
  });

  test('needsAllowBuilds returns 200 and does not restart', async () => {
    let restarted = 0;
    startDesktopInstallControl({
      installPlugin: async () => ({
        ok: false,
        needsAllowBuilds: true,
        allowBuilds: ['github.com/owner/repo'],
        spec: 'github:owner/repo',
        error: '需要允许该插件在本机执行构建脚本',
      }),
      startHarness: async () => {
        restarted += 1;
      },
      restartDelayMs: 20,
    });
    const { url, token } = await desktopInstallReady();
    const response = await postInstall(url, token, JSON.stringify({ spec: 'github:owner/repo' }));
    const body = await response.json();
    assert.equal(body.needsAllowBuilds, true);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(restarted, 0);
  });

  test('rejects a non-github spec with 400 and never installs', async () => {
    let installs = 0;
    startDesktopInstallControl({
      installPlugin: async () => {
        installs += 1;
        return { ok: true };
      },
      startHarness: async () => {},
    });
    const { url, token } = await desktopInstallReady();
    const response = await postInstall(url, token, JSON.stringify({ spec: 'npm:left-pad' }));
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.ok, false);
    assert.match(body.error, /github:owner\/repo/);
    assert.equal(installs, 0);
  });

  test('rejects a missing bearer token', async () => {
    startDesktopInstallControl({
      installPlugin: async () => ({ ok: true }),
      startHarness: async () => {},
    });
    const { url } = await desktopInstallReady();
    const response = await fetch(new URL('/install', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spec: 'github:owner/repo' }),
    });
    assert.equal(response.status, 401);
  });

  test('rejects invalid allowBuilds with 400 and never installs', async () => {
    let installs = 0;
    startDesktopInstallControl({
      installPlugin: async () => {
        installs += 1;
        return { ok: true };
      },
      startHarness: async () => {},
    });
    const { url, token } = await desktopInstallReady();
    const response = await postInstall(url, token, JSON.stringify({
      spec: 'github:owner/repo',
      allowBuilds: ['good-package\nmalicious: true'],
    }));
    assert.equal(response.status, 400);
    assert.equal(installs, 0);
  });

  test('rejects invalid JSON with 400', async () => {
    startDesktopInstallControl({
      installPlugin: async () => ({ ok: true }),
      startHarness: async () => {},
    });
    const { url, token } = await desktopInstallReady();
    const response = await postInstall(url, token, '{');
    assert.equal(response.status, 400);
  });

  test('spawnEnv receives the loopback URL and token', async () => {
    startDesktopInstallControl({
      installPlugin: async () => ({ ok: true }),
      startHarness: async () => {},
    });
    await desktopInstallReady();
    const injected = desktopInstallEnv();
    assert.match(injected.DSH_DESKTOP_INSTALL_URL, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(injected.DSH_DESKTOP_INSTALL_TOKEN.length, 64);
    setDesktopDshHome(os.tmpdir());
    const env = new DshManager({ loadConfig: () => ({}) }).spawnEnv({}, null);
    assert.equal(env.DSH_DESKTOP_INSTALL_URL, injected.DSH_DESKTOP_INSTALL_URL);
    assert.equal(env.DSH_DESKTOP_INSTALL_TOKEN, injected.DSH_DESKTOP_INSTALL_TOKEN);
    assert.equal(env.DSH_HOME, path.resolve(os.tmpdir()));
  });
});
