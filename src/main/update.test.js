'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { summarizeRelease, installRelease, checkUpdate, listReleases, downloadFile } = require('./update');

test('summarizeRelease skips drafts and marks a missing installer', () => {
  assert.equal(summarizeRelease({ draft: true, tag_name: 'v0.2.7' }, '0.2.6'), null);
  const listed = summarizeRelease({
    draft: false,
    prerelease: true,
    tag_name: 'v0.2.6',
    html_url: 'https://example.test/r',
    body: 'notes',
    assets: [{ name: 'Deepseek-Harness-Desktop-Setup-0.2.6.exe', browser_download_url: 'https://example.test/setup.exe' }],
  }, '0.2.6');
  assert.equal(listed.prerelease, true);
  assert.equal(listed.current, true);
  assert.equal(listed.installable, true);
  const sourceOnly = summarizeRelease({
    draft: false,
    tag_name: 'v0.2.5',
    assets: [{ name: 'source.zip', browser_download_url: 'https://example.test/src.zip' }],
  }, '0.2.6');
  assert.equal(sourceOnly.installable, false);
  assert.equal(sourceOnly.newer, false);
});

test('checkUpdate passes an abort signal and degrades to status error on timeout', async () => {
  const previousFetch = global.fetch;
  let seenSignal = null;
  global.fetch = async (_url, options) => {
    seenSignal = options?.signal;
    const error = new Error('The operation was aborted due to timeout');
    error.name = 'TimeoutError';
    throw error;
  };
  try {
    const result = await checkUpdate();
    assert.equal(result.status, 'error');
    assert.match(result.message, /超时/);
    assert.ok(seenSignal instanceof AbortSignal, 'fetch must receive an AbortSignal');
  } finally {
    global.fetch = previousFetch;
  }
});

test('listReleases degrades to an empty list with a message on timeout', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  };
  try {
    const result = await listReleases();
    assert.equal(result.status, 'error');
    assert.deepEqual(result.releases, []);
    assert.match(result.message, /超时/);
  } finally {
    global.fetch = previousFetch;
  }
});

test('downloadFile fails, aborts the request, and removes the partial after the overall timeout', async () => {
  const previousGet = https.get;
  let destroyed = false;
  https.get = (_target, _options, _onResponse) => {
    // Connection that never responds: only the overall deadline can settle it.
    const request = new EventEmitter();
    request.destroy = () => {
      destroyed = true;
    };
    return request;
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-update-dl-'));
  const dest = path.join(dir, 'setup.exe');
  try {
    await assert.rejects(
      () => downloadFile('https://example.test/setup.exe', dest, null, { timeoutMs: 50 }),
      /下载超时/,
    );
    assert.equal(destroyed, true);
    assert.equal(fs.existsSync(dest), false);
  } finally {
    https.get = previousGet;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installRelease refuses a tag with no Setup.exe', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      draft: false,
      prerelease: false,
      tag_name: 'v0.2.0',
      html_url: 'https://example.test/r',
      body: '',
      assets: [{ name: 'source.zip', browser_download_url: 'https://example.test/src.zip' }],
    }),
  });
  try {
    const result = await installRelease('v0.2.0');
    assert.equal(result.message, 'no-installer');
    assert.equal(result.launched, false);
  } finally {
    global.fetch = previousFetch;
  }
});
