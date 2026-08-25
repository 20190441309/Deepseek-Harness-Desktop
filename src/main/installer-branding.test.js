'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const nsis = pkg.build.nsis;

function readBmp(relative) {
  const buf = fs.readFileSync(path.join(ROOT, relative));
  return {
    magic: buf.toString('ascii', 0, 2),
    width: buf.readInt32LE(18),
    height: buf.readInt32LE(22),
    bitsPerPixel: buf.readUInt16LE(28),
    compression: buf.readUInt32LE(30),
  };
}

test('nsis keeps the assisted-installer product contract', () => {
  assert.equal(nsis.oneClick, false);
  assert.equal(nsis.allowToChangeInstallationDirectory, true);
  assert.equal(nsis.createDesktopShortcut, true);
  assert.equal(nsis.createStartMenuShortcut, true);
  assert.equal(nsis.shortcutName, 'Deepseek-Harness-Desktop');
  assert.equal(nsis.artifactName, 'Deepseek-Harness-Desktop-Setup-${version}.${ext}');
  // Per-user default install path (%LOCALAPPDATA%\Programs) — TC-INST-013
  // opens resources\node.exe there; do not flip to perMachine.
  assert.equal(nsis.perMachine, undefined);
  // Uninstall must never delete userData (desktop dsh-home lives there).
  assert.equal(nsis.deleteAppDataOnUninstall, undefined);
});

test('release workflow artifact globs still match the artifact name', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.ok(nsis.artifactName.startsWith('Deepseek-Harness-Desktop-Setup-'));
  assert.match(yml, /dist\/Deepseek-Harness-Desktop-Setup-\*\.exe/);
  assert.match(yml, /dist\/Deepseek-Harness-Desktop-Setup-\*\.exe\.blockmap/);
});

test('branded installer bitmaps are classic 24-bit BMPs at MUI2 geometry', () => {
  const cases = [
    [nsis.installerSidebar, 'build/installerSidebar.bmp', 164, 314],
    [nsis.uninstallerSidebar, 'build/uninstallerSidebar.bmp', 164, 314],
    [nsis.installerHeader, 'build/installerHeader.bmp', 150, 57],
  ];
  for (const [configured, expectedPath, width, height] of cases) {
    assert.equal(configured, expectedPath);
    const bmp = readBmp(expectedPath);
    assert.equal(bmp.magic, 'BM', `${expectedPath} must be a BMP`);
    assert.equal(bmp.width, width, `${expectedPath} width`);
    assert.equal(bmp.height, height, `${expectedPath} height`);
    assert.equal(bmp.bitsPerPixel, 24, `${expectedPath} must be 24-bit`);
    assert.equal(bmp.compression, 0, `${expectedPath} must be uncompressed (BI_RGB)`);
  }
});

test('installer and uninstaller icons stay on the product whale icon', () => {
  assert.equal(pkg.build.win.icon, 'assets/icon.ico');
  assert.equal(nsis.installerIcon, 'assets/icon.ico');
  assert.equal(nsis.uninstallerIcon, 'assets/icon.ico');
  const ico = fs.readFileSync(path.join(ROOT, 'assets', 'icon.ico'));
  assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0], 'assets/icon.ico must be an ICO container');
});

test('license page shows the repository MIT license', () => {
  assert.equal(nsis.license, 'LICENSE');
  const license = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  assert.match(license, /^MIT License/);
});

test('installer languages are Chinese-first with an English fallback', () => {
  // zh_CN first: unmatched OS locales fall back to the first MUI language.
  assert.deepEqual(nsis.installerLanguages, ['zh_CN', 'en_US']);
});

test('installer.nsh customizes GUI pages only and stays silent-install (/S) safe', () => {
  assert.equal(nsis.include, 'build/installer.nsh');
  const nsh = fs.readFileSync(path.join(ROOT, 'build', 'installer.nsh'), 'utf8');
  // Exactly the two GUI-only extension points; anything else (customInstall,
  // customInit, sections…) would also run during silent installs/upgrades.
  const macros = [...nsh.matchAll(/^!macro\s+(\S+)/gm)].map((m) => m[1]);
  assert.deepEqual(macros, ['customWelcomePage', 'customHeader']);
  assert.match(nsh, /!insertmacro MUI_PAGE_WELCOME/);
  assert.match(nsh, /BrandingText "Deepseek-Harness-Desktop \$\{VERSION\}"/);
  const code = nsh
    .split('\n')
    .filter((line) => !line.trim().startsWith('#') && !line.trim().startsWith(';'))
    .join('\n');
  assert.doesNotMatch(code, /MessageBox/i);
  assert.doesNotMatch(code, /RequestExecutionLevel/i);
  assert.doesNotMatch(code, /^\s*Section\b/im);
  assert.doesNotMatch(code, /ExecWait|ExecShell\b/);
});

test('bitmap renderer pins the MUI2 geometry and stays regenerable', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'render-installer-assets.js'), 'utf8');
  assert.match(source, /SIDEBAR_WIDTH = 164/);
  assert.match(source, /SIDEBAR_HEIGHT = 314/);
  assert.match(source, /HEADER_WIDTH = 150/);
  assert.match(source, /HEADER_HEIGHT = 57/);
  // Brand literals mirror the icon tile and --dsw-static-deepseek-500.
  assert.match(source, /rgb\(65, 118, 230\)/);
  assert.equal(pkg.scripts['installer:assets'], 'node scripts/run-render-installer-assets.js');
});
