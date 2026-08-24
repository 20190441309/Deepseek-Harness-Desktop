const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function fakeRenderer() {
  return {
    invoke: () => Promise.resolve(),
    send: () => {},
    on: () => {},
    removeListener: () => {},
  };
}

function loadPreload(argv = ['electron']) {
  const electronPath = require.resolve('electron');
  const preloadPath = require.resolve('./index');
  const cachedElectron = require.cache[electronPath];
  const cachedPreload = require.cache[preloadPath];
  const previousArgv = process.argv.slice();
  let exposed = null;

  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: {
      contextBridge: {
        exposeInMainWorld(name, api) {
          exposed = { name, api };
        },
      },
      ipcRenderer: fakeRenderer(),
    },
  };
  process.argv.splice(0, process.argv.length, ...argv);
  delete require.cache[preloadPath];

  try {
    return { exports: require('./index'), exposed };
  } finally {
    process.argv.splice(0, process.argv.length, ...previousArgv);
    if (cachedElectron) require.cache[electronPath] = cachedElectron;
    else delete require.cache[electronPath];
    if (cachedPreload) require.cache[preloadPath] = cachedPreload;
    else delete require.cache[preloadPath];
  }
}

const { buildShellApi, shellRole } = loadPreload().exports;

test('shellRole accepts only explicit desktop roles', () => {
  assert.equal(shellRole(['electron', '--dshd-shell-role=boot']), 'boot');
  assert.equal(shellRole(['electron', '--dshd-shell-role=harness']), 'harness');
  assert.equal(shellRole(['electron', '--dshd-shell-role=launcher']), 'launcher');
  assert.equal(shellRole(['electron', '--dshd-shell-role=marketplace']), null);
  assert.equal(shellRole(['electron', '--dshd-shell-role=admin']), null);
  assert.equal(shellRole(['electron']), null);
});

test('sandbox preload entry is self-contained and exposes the selected role', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  assert.doesNotMatch(source, /require\(\s*['"]\.{1,2}[\\/]/);

  const { exposed } = loadPreload(['electron', '--dshd-shell-role=boot']);
  assert.equal(exposed?.name, 'shell');
  assert.equal(typeof exposed?.api.getState, 'function');
  assert.equal(exposed?.api.writeFile, undefined);
});

test('boot preload exposes recovery but no workspace mutation', () => {
  const api = buildShellApi('boot', fakeRenderer());
  assert.equal(typeof api.restart, 'function');
  assert.equal(typeof api.getState, 'function');
  assert.equal(typeof api.saveBootLog, 'function');
  assert.equal(api.writeFile, undefined);
  assert.equal(api.installPlugin, undefined);
  assert.equal(api.saveConfig, undefined);
  assert.equal(api.openDshHome, undefined);
});

test('marketplace preload role is not exposed', () => {
  assert.equal(buildShellApi('marketplace', fakeRenderer()), null);

  const { exposed } = loadPreload(['electron', '--dshd-shell-role=marketplace']);
  assert.equal(exposed, null);
});

test('harness preload keeps work loops and omits parked remote', () => {
  const api = buildShellApi('harness', fakeRenderer());
  assert.equal(typeof api.writeFile, 'function');
  assert.equal(typeof api.listEditors, 'function');
  assert.equal(typeof api.openInEditor, 'function');
  assert.equal(typeof api.showItemInFolder, 'function');
  assert.equal(typeof api.openDshHome, 'function');
  assert.equal(typeof api.openWithSystemDefault, 'function');
  assert.equal(typeof api.ptyCreate, 'function');
  assert.equal(typeof api.previewOpen, 'function');
  assert.equal(typeof api.previewWorkspaceFile, 'function');
  assert.equal(typeof api.onOpenPreviewUrl, 'function');
  assert.equal(typeof api.gitCommit, 'function');
  assert.equal(typeof api.listWallpaperCatalog, 'function');
  assert.equal(typeof api.downloadWallpaper, 'function');
  assert.equal(typeof api.previewHardReload, 'function');
  assert.equal(typeof api.previewStop, 'function');
  assert.equal(typeof api.previewZoomIn, 'function');
  assert.equal(typeof api.previewZoomOut, 'function');
  assert.equal(typeof api.previewResetZoom, 'function');
  assert.equal(typeof api.previewSetColorScheme, 'function');
  assert.equal(typeof api.previewClearCookies, 'function');
  assert.equal(typeof api.previewClearCache, 'function');
  assert.equal(typeof api.previewCaptureScreenshot, 'function');
  assert.equal(typeof api.previewPickElement, 'function');
  assert.equal(typeof api.previewCancelPick, 'function');
  assert.equal(typeof api.previewSetAnnotationTheme, 'function');
  assert.equal(typeof api.previewOpenPictureInPicture, 'function');
  assert.equal(typeof api.previewClosePictureInPicture, 'function');
  assert.equal(typeof api.previewStartRecording, 'function');
  assert.equal(typeof api.previewStopRecording, 'function');
  assert.equal(typeof api.onPreviewRecordingFrame, 'function');
  assert.equal(typeof api.previewSaveRecording, 'function');
  assert.equal(typeof api.previewRevealArtifact, 'function');
  assert.equal(typeof api.previewCopyArtifactToClipboard, 'function');
  assert.equal(typeof api.previewAutomationStatus, 'function');
  assert.equal(typeof api.previewAutomationSnapshot, 'function');
  assert.equal(typeof api.previewAutomationClick, 'function');
  assert.equal(typeof api.previewAutomationType, 'function');
  assert.equal(typeof api.previewAutomationPress, 'function');
  assert.equal(typeof api.previewAutomationScroll, 'function');
  assert.equal(typeof api.previewAutomationEvaluate, 'function');
  assert.equal(typeof api.previewAutomationWaitFor, 'function');
  assert.equal(api.getRemote, undefined);
  assert.equal(api.saveRemote, undefined);
  assert.equal(api.rotateRemoteToken, undefined);
  assert.equal(api.unbindRemoteDevice, undefined);
  assert.equal(api.saveBootLog, undefined);
});

test('boot preload omits guest preview IPC', () => {
  const api = buildShellApi('boot', fakeRenderer());
  assert.equal(api.listEditors, undefined);
  assert.equal(api.openInEditor, undefined);
  assert.equal(api.showItemInFolder, undefined);
  assert.equal(api.openWithSystemDefault, undefined);
  assert.equal(api.previewOpen, undefined);
  assert.equal(api.previewHardReload, undefined);
  assert.equal(api.previewStop, undefined);
  assert.equal(api.previewZoomIn, undefined);
  assert.equal(api.previewZoomOut, undefined);
  assert.equal(api.previewResetZoom, undefined);
  assert.equal(api.previewSetColorScheme, undefined);
  assert.equal(api.previewClearCookies, undefined);
  assert.equal(api.previewClearCache, undefined);
  assert.equal(api.previewCaptureScreenshot, undefined);
  assert.equal(api.previewPickElement, undefined);
  assert.equal(api.previewCancelPick, undefined);
  assert.equal(api.previewSetAnnotationTheme, undefined);
  assert.equal(api.previewOpenPictureInPicture, undefined);
  assert.equal(api.previewClosePictureInPicture, undefined);
  assert.equal(api.previewStartRecording, undefined);
  assert.equal(api.previewStopRecording, undefined);
  assert.equal(api.onPreviewRecordingFrame, undefined);
  assert.equal(api.previewSaveRecording, undefined);
  assert.equal(api.previewRevealArtifact, undefined);
  assert.equal(api.previewCopyArtifactToClipboard, undefined);
  assert.equal(api.previewAutomationStatus, undefined);
  assert.equal(api.previewAutomationSnapshot, undefined);
  assert.equal(api.previewAutomationClick, undefined);
  assert.equal(api.previewAutomationType, undefined);
  assert.equal(api.previewAutomationPress, undefined);
  assert.equal(api.previewAutomationScroll, undefined);
  assert.equal(api.previewAutomationEvaluate, undefined);
  assert.equal(api.previewAutomationWaitFor, undefined);
});

test('preload remote flag stays in sync with config.js', () => {
  const configSrc = fs.readFileSync(path.join(__dirname, '../main/config.js'), 'utf8');
  const preloadSrc = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const configFlag = configSrc.match(/const REMOTE_FEATURE_ENABLED = (true|false);/);
  const preloadFlag = preloadSrc.match(/const REMOTE_FEATURE_ENABLED = (true|false);/);
  assert.ok(configFlag && preloadFlag);
  assert.equal(preloadFlag[1], configFlag[1]);
});

test('harness preload exposes installMarketplacePlugin and omits seed install draft', () => {
  const api = buildShellApi('harness', fakeRenderer());
  assert.equal(typeof api.installMarketplacePlugin, 'function');
  assert.equal(typeof api.installPlugin, 'function');
  assert.equal(api.seedInstallDraft, undefined);
  assert.equal(api.onSeedInstallDraft, undefined);
});

test('launcher preload exposes import, releases, and forensics', () => {
  const api = buildShellApi('launcher', fakeRenderer());
  assert.equal(typeof api.scanImport, 'function');
  assert.equal(typeof api.runImport, 'function');
  assert.equal(typeof api.pickImportSource, 'function');
  assert.equal(typeof api.pickSkillDir, 'function');
  assert.equal(typeof api.listReleases, 'function');
  assert.equal(typeof api.installRelease, 'function');
  assert.equal(typeof api.pluginForensics, 'function');
  assert.equal(typeof api.startDesktop, 'function');
  assert.equal(typeof api.skipUserPlugins, 'function');
  assert.equal(typeof api.retryFullPlugins, 'function');
  assert.equal(api.writeFile, undefined);
  assert.equal(api.installPlugin, undefined);
});

test('boot preload cannot import data or install a release', () => {
  const api = buildShellApi('boot', fakeRenderer());
  assert.equal(api.scanImport, undefined);
  assert.equal(api.runImport, undefined);
  assert.equal(api.installRelease, undefined);
  assert.equal(api.pluginForensics, undefined);
});
