const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  isLoopbackHttpUrl,
  isHttpOrHttpsUrl,
  shouldAllowPrivilegedNavigate,
  shouldAllowPrivilegedRedirect,
} = require('./local-url.js');

/**
 * Minimal WebContents stand-in for attachPrivilegedNavigationGuards.
 * Electron is not loaded; the helper under test only uses EventEmitter APIs.
 */
function createFakeContents(currentUrl) {
  const contents = new EventEmitter();
  contents._url = currentUrl;
  contents.getURL = () => contents._url;
  contents.setWindowOpenHandler = (handler) => {
    contents._openHandler = handler;
  };
  return contents;
}

test('attachPrivilegedNavigationGuards denies navigate/redirect and opens http(s) only', () => {
  // Lazy require so node:test can run without Electron.
  const Module = require('node:module');
  const electronPath = require.resolve('electron');
  const previous = require.cache[electronPath];
  const opened = [];
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: {
      BrowserView: class {},
      BrowserWindow: class {},
      shell: { openExternal: (url) => { opened.push(url); } },
      nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
    },
  };
  try {
    delete require.cache[require.resolve('./window.js')];
    delete require.cache[require.resolve('./chrome.js')];
    delete require.cache[require.resolve('./paths.js')];
    // paths.js requires electron.app — stub via the same cache entry.
    require.cache[electronPath].exports.app = { isPackaged: false };
    const { attachPrivilegedNavigationGuards } = require('./window.js');
    const contents = createFakeContents('http://127.0.0.1:3080/');
    attachPrivilegedNavigationGuards(contents, {
      allowUrl: isLoopbackHttpUrl,
      openDeniedExternal: true,
    });

    const navEvent = { preventDefault() { navEvent.prevented = true; }, prevented: false };
    contents.emit('will-navigate', navEvent, 'https://evil.example/');
    assert.equal(navEvent.prevented, true);
    assert.deepEqual(opened, ['https://evil.example/']);

    opened.length = 0;
    const redirectEvent = { preventDefault() { redirectEvent.prevented = true; }, prevented: false };
    contents.emit('will-redirect', redirectEvent, 'https://evil.example/r');
    assert.equal(redirectEvent.prevented, true);
    assert.deepEqual(opened, []);

    const fileNav = { preventDefault() { fileNav.prevented = true; }, prevented: false };
    contents.emit('will-navigate', fileNav, 'file:///C:/evil.html');
    assert.equal(fileNav.prevented, true);
    assert.deepEqual(opened, []);

    const allowNav = { preventDefault() { allowNav.prevented = true; }, prevented: false };
    contents.emit('will-navigate', allowNav, 'http://127.0.0.1:3080/app');
    assert.equal(allowNav.prevented, false);

    assert.equal(typeof contents._openHandler, 'function');
    assert.deepEqual(contents._openHandler({ url: 'https://docs.example/' }), { action: 'deny' });
    assert.ok(opened.includes('https://docs.example/'));
    opened.length = 0;
    contents._openHandler({ url: 'file:///C:/x' });
    assert.deepEqual(opened, []);
  } finally {
    if (previous) require.cache[electronPath] = previous;
    else delete require.cache[electronPath];
    delete require.cache[require.resolve('./window.js')];
  }
});

test('showHarness load policy rejects non-loopback and rewrites 0.0.0.0', () => {
  const { rewriteLoopbackLoadUrl } = require('./local-url.js');
  assert.equal(rewriteLoopbackLoadUrl('https://evil.example/'), null);
  assert.equal(rewriteLoopbackLoadUrl('http://0.0.0.0:3080/'), 'http://127.0.0.1:3080/');
  assert.equal(
    shouldAllowPrivilegedNavigate({
      nextUrl: 'http://127.0.0.1:3080/',
      currentUrl: 'file://boot',
      allowUrl: isLoopbackHttpUrl,
    }),
    true,
  );
  assert.equal(
    shouldAllowPrivilegedRedirect({
      nextUrl: 'https://evil.example/',
      allowUrl: isLoopbackHttpUrl,
    }),
    false,
  );
  assert.equal(isHttpOrHttpsUrl('javascript:alert(1)'), false);
});
