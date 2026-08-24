'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { summarizeRelease, installRelease } = require('./update');

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
