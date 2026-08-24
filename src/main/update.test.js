'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const {
  summarizeRelease,
  installRelease,
  checkUpdate,
  listReleases,
  getInstalledAppInfo,
  launchUninstaller,
  discoverWindowsInstall,
  parseRegBlock,
  uninstallExeCandidates,
  APP_ID,
  PRODUCT_NAME,
  downloadFile,
  parseSha512Sums,
  verifyAssetChecksum,
  CHECKSUM_ASSET_NAME,
} = require('./update');

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
  assert.equal(sourceOnly.older, true);
});

test('getInstalledAppInfo reports version and source-run uninstall guidance when unpackaged', () => {
  const info = getInstalledAppInfo({ isPackaged: false, existsSync: () => false, execFileSync: () => { throw new Error('missing'); } });
  assert.equal(typeof info.version, 'string');
  assert.equal(info.packaged, false);
  assert.equal(info.runningFromSource, true);
  assert.equal(info.registeredInstall, false);
  assert.equal(info.uninstallAvailable, false);
  assert.match(info.uninstallNote, /源码运行，无本机安装包可卸载/);
});

test('parseRegBlock accepts InstallLocation without UninstallString', () => {
  const block = [
    'DisplayName    REG_SZ    Deepseek-Harness-Desktop',
    'InstallLocation    REG_SZ    C:\\Apps\\Deepseek-Harness-Desktop',
    'DisplayVersion    REG_SZ    0.2.6',
  ].join('\n');
  const parsed = parseRegBlock(block, 'HKCU\\test');
  assert.ok(parsed);
  assert.equal(parsed.installPath, 'C:\\Apps\\Deepseek-Harness-Desktop');
  assert.equal(parsed.displayVersion, '0.2.6');
  assert.equal(parsed.uninstallCommand, '');
});

test('discoverWindowsInstall resolves uninstall exe under InstallLocation', () => {
  const installDir = 'C:\\Apps\\Deepseek-Harness-Desktop';
  const uninstallExe = uninstallExeCandidates(installDir)[0];
  const registryOutput = [
    'DisplayName    REG_SZ    Deepseek-Harness-Desktop',
    `InstallLocation    REG_SZ    ${installDir}`,
    'DisplayVersion    REG_SZ    0.2.6',
    `UninstallString    REG_SZ    "${uninstallExe}" /currentuser`,
  ].join('\n');
  const discovery = discoverWindowsInstall({
    platform: 'win32',
    isPackaged: false,
    existsSync: (candidate) => candidate === uninstallExe,
    execFileSync: (_cmd, args) => {
      if (args[0] === 'query' && String(args[1]).includes(APP_ID)) {
        return registryOutput;
      }
      throw new Error('missing');
    },
  });
  assert.equal(discovery.registered, true);
  assert.equal(discovery.uninstallMode, 'direct');
  assert.equal(discovery.uninstallCommand, uninstallExe);
  assert.equal(discovery.version, '0.2.6');
});

test('discoverWindowsInstall falls back to settings when uninstall exe is missing', () => {
  const installDir = 'C:\\Apps\\Deepseek-Harness-Desktop';
  const uninstallExe = uninstallExeCandidates(installDir)[0];
  const registryOutput = [
    'DisplayName    REG_SZ    Deepseek-Harness-Desktop',
    `InstallLocation    REG_SZ    ${installDir}`,
    `UninstallString    REG_SZ    "${uninstallExe}" /currentuser`,
  ].join('\n');
  const discovery = discoverWindowsInstall({
    platform: 'win32',
    isPackaged: true,
    existsSync: () => false,
    execFileSync: (_cmd, args) => {
      if (args[0] === 'query' && String(args[1]).includes(APP_ID)) {
        return registryOutput;
      }
      throw new Error('missing');
    },
  });
  assert.equal(discovery.registered, true);
  assert.equal(discovery.uninstallMode, 'settings');
  assert.ok(discovery.searchedPaths.includes(uninstallExe));
});

test('getInstalledAppInfo exposes registered install while running from source', () => {
  const installDir = 'C:\\Apps\\Deepseek-Harness-Desktop';
  const registryOutput = [
    'DisplayName    REG_SZ    Deepseek-Harness-Desktop',
    `InstallLocation    REG_SZ    ${installDir}`,
    'DisplayVersion    REG_SZ    0.2.6',
    `UninstallString    REG_SZ    "${uninstallExePath(installDir)}" /currentuser`,
  ].join('\n');
  const info = getInstalledAppInfo({
    platform: 'win32',
    isPackaged: false,
    existsSync: (candidate) => candidate === uninstallExePath(installDir),
    execFileSync: (_cmd, args) => {
      if (args[0] === 'query' && String(args[1]).includes(APP_ID)) {
        return registryOutput;
      }
      throw new Error('missing');
    },
  });
  assert.equal(info.registeredInstall, true);
  assert.equal(info.version, '0.2.6');
  assert.equal(info.installPath, installDir);
  assert.equal(info.uninstallAvailable, true);
  assert.equal(info.uninstallUsesSettings, false);
});

test('launchUninstaller returns source-run guidance when no registered install', async () => {
  const result = await launchUninstaller({
    isPackaged: false,
    existsSync: () => false,
    execFileSync: () => { throw new Error('missing'); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'source-run-no-install');
  assert.match(result.message, /源码运行，无本机安装包可卸载/);
});

function uninstallExePath(installDir) {
  return uninstallExeCandidates(installDir)[0];
}

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

test('summarizeRelease exposes the SHA512SUMS.txt checksum manifest when present', () => {
  const listed = summarizeRelease({
    draft: false,
    tag_name: 'v0.2.8',
    assets: [
      { name: 'Deepseek-Harness-Desktop-Setup-0.2.8.exe', browser_download_url: 'https://example.test/setup.exe' },
      { name: CHECKSUM_ASSET_NAME, browser_download_url: 'https://example.test/SHA512SUMS.txt' },
    ],
  }, '0.2.7');
  assert.equal(listed.checksumUrl, 'https://example.test/SHA512SUMS.txt');
  const withoutManifest = summarizeRelease({
    draft: false,
    tag_name: 'v0.2.6',
    assets: [{ name: 'Deepseek-Harness-Desktop-Setup-0.2.6.exe', browser_download_url: 'https://example.test/setup.exe' }],
  }, '0.2.7');
  assert.equal(withoutManifest.checksumUrl, '');
});

test('parseSha512Sums reads sha512sum lines and ignores garbage', () => {
  const hexA = 'a'.repeat(128);
  const hexB = 'B'.repeat(128);
  const sums = parseSha512Sums([
    `${hexA}  Deepseek-Harness-Desktop-Setup-0.2.8.exe`,
    `${hexB} *Deepseek-Harness-Desktop-0.2.8-mac-arm64.dmg`,
    'not a checksum line',
    'deadbeef  short-hash.exe',
    '',
  ].join('\n'));
  assert.equal(sums.get('Deepseek-Harness-Desktop-Setup-0.2.8.exe'), hexA);
  assert.equal(sums.get('Deepseek-Harness-Desktop-0.2.8-mac-arm64.dmg'), 'b'.repeat(128));
  assert.equal(sums.size, 2);
});

test('verifyAssetChecksum passes a good digest and rejects mismatch or missing entry', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-update-sum-'));
  const dest = path.join(dir, 'setup.exe');
  fs.writeFileSync(dest, 'installer-bytes');
  const digest = crypto.createHash('sha512').update('installer-bytes').digest('hex');
  const previousFetch = global.fetch;
  const respond = (text) => async () => ({ ok: true, status: 200, text: async () => text });
  try {
    global.fetch = respond(`${digest}  Setup.exe\n`);
    await verifyAssetChecksum(dest, 'Setup.exe', 'https://example.test/SHA512SUMS.txt');

    global.fetch = respond(`${'0'.repeat(128)}  Setup.exe\n`);
    await assert.rejects(
      () => verifyAssetChecksum(dest, 'Setup.exe', 'https://example.test/SHA512SUMS.txt'),
      /sha512 不匹配/,
    );

    global.fetch = respond(`${digest}  Other.exe\n`);
    await assert.rejects(
      () => verifyAssetChecksum(dest, 'Setup.exe', 'https://example.test/SHA512SUMS.txt'),
      /缺少 Setup\.exe/,
    );

    global.fetch = async () => ({ ok: false, status: 404, text: async () => '' });
    await assert.rejects(
      () => verifyAssetChecksum(dest, 'Setup.exe', 'https://example.test/SHA512SUMS.txt'),
      /校验清单下载失败/,
    );
  } finally {
    global.fetch = previousFetch;
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
