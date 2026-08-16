const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('boot caption disables drag while the harness BrowserView covers it', () => {
  const css = fs.readFileSync(path.join(__dirname, '../renderer/boot.css'), 'utf8');
  assert.match(css, /body\[data-harness-covered\] \.caption/);
  assert.match(css, /body\[data-harness-covered\] \.caption[\s\S]*?-webkit-app-region:\s*no-drag/);
});

test('setBootHarnessCovered toggles the boot flag only on boot.html', () => {
  const electronPath = require.resolve('electron');
  const previous = require.cache[electronPath];
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: {
      BrowserView: class {},
      BrowserWindow: class {},
      shell: { openExternal() {} },
      nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
      app: { isPackaged: false },
    },
  };
  try {
    delete require.cache[require.resolve('./window.js')];
    delete require.cache[require.resolve('./chrome.js')];
    delete require.cache[require.resolve('./paths.js')];
    const { setBootHarnessCovered } = require('./window.js');
    const scripts = [];
    const bootWin = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        getURL: () => 'file:///C:/app/src/renderer/boot.html',
        executeJavaScript(code) {
          scripts.push(code);
          return Promise.resolve();
        },
      },
    };
    setBootHarnessCovered(bootWin, true);
    setBootHarnessCovered(bootWin, false);
    assert.match(scripts[0], /toggleAttribute\('data-harness-covered', true\)/);
    assert.match(scripts[1], /toggleAttribute\('data-harness-covered', false\)/);

    const otherWin = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        getURL: () => 'http://127.0.0.1:3080/',
        executeJavaScript() {
          throw new Error('must not run on the harness view');
        },
      },
    };
    setBootHarnessCovered(otherWin, true);
  } finally {
    if (previous) {
      require.cache[electronPath] = previous;
    } else {
      delete require.cache[electronPath];
    }
    delete require.cache[require.resolve('./window.js')];
    delete require.cache[require.resolve('./chrome.js')];
    delete require.cache[require.resolve('./paths.js')];
  }
});
