'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  emptyInstallResult,
  normalizeInstallResult,
  renderInstall,
  executeInstallDshPlugin,
} = require('./install-dsh-plugin-client');

test('empty spec fails before contacting the control endpoint', async () => {
  const request = async () => {
    throw new Error('should not fetch');
  };
  const result = await executeInstallDshPlugin({ url: 'http://127.0.0.1:1', token: 't' }, '  ', [], request);
  assert.deepEqual(result, emptyInstallResult('missing install spec'));
});

test('non-github specs fail client-side before contacting the control endpoint', async () => {
  const request = async () => {
    throw new Error('should not fetch');
  };
  const invalid = ['lodash', 'file:../local', 'https://git.example/x.git', 'github:owner', 'github:owner/repo#sha#extra'];
  for (const spec of invalid) {
    const result = await executeInstallDshPlugin({ url: 'http://127.0.0.1:1', token: 't' }, spec, [], request);
    assert.equal(result.ok, false, spec);
    assert.equal(result.restarting, false, spec);
    assert.match(result.error, /github:owner\/repo/, spec);
  }
});

test('needsAllowBuilds is a canonical result and does not mark restarting', async () => {
  const result = await executeInstallDshPlugin(
    { url: 'http://127.0.0.1:1', token: 't' },
    'github:owner/repo#abc',
    ['github.com/owner/repo'],
    async (_url, _token, spec, allowBuilds) => ({
      ok: false,
      needsAllowBuilds: true,
      allowBuilds,
      spec,
      error: '需要允许该插件在本机执行构建脚本',
      log: 'Ignored build scripts',
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.needsAllowBuilds, true);
  assert.deepEqual(result.allowBuilds, ['github.com/owner/repo']);
  assert.equal(result.restarting, false);
  assert.match(renderInstall(result), /retry install_dsh_plugin with allowBuilds: github.com\/owner\/repo/);
});

test('a successful install reports restarting and keeps the pinned spec', async () => {
  const result = normalizeInstallResult({
    ok: true,
    spec: 'github:owner/repo#deadbeef',
    log: 'added',
  }, 'github:owner/repo');
  assert.equal(result.ok, true);
  assert.equal(result.spec, 'github:owner/repo#deadbeef');
  assert.equal(result.restarting, true);
  assert.match(renderInstall(result), /Installed github:owner\/repo#deadbeef/);
});

test('a dropped-plugin error stays a failure without restart', () => {
  const result = normalizeInstallResult({
    ok: false,
    error: '该插件已退役，不再提供安装',
    spec: 'github:x/dsh-genui',
  }, 'github:x/dsh-genui');
  assert.equal(result.restarting, false);
  assert.match(renderInstall(result), /Install failed/);
});
