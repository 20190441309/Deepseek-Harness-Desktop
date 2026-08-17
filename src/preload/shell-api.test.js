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
  assert.equal(shellRole(['electron', '--dshd-shell-role=marketplace']), 'marketplace');
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
  assert.equal(api.writeFile, undefined);
  assert.equal(api.installPlugin, undefined);
  assert.equal(api.saveConfig, undefined);
});

test('marketplace preload is limited to catalog and token settings', () => {
  const api = buildShellApi('marketplace', fakeRenderer());
  assert.equal(typeof api.listMarketplace, 'function');
  assert.equal(typeof api.seedInstallDraft, 'function');
  assert.equal(typeof api.saveConfig, 'function');
  assert.equal(api.installPlugin, undefined);
  assert.equal(api.writeFile, undefined);
  assert.equal(api.ptyCreate, undefined);
});

test('harness preload keeps work loops but omits frozen remote controls', () => {
  const api = buildShellApi('harness', fakeRenderer());
  assert.equal(typeof api.writeFile, 'function');
  assert.equal(typeof api.ptyCreate, 'function');
  assert.equal(typeof api.previewOpen, 'function');
  assert.equal(typeof api.gitCommit, 'function');
  assert.equal(api.saveRemote, undefined);
  assert.equal(api.rotateRemoteToken, undefined);
});
