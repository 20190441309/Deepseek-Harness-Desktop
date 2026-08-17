const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPreviewController,
  discoverLocalServers,
  isAllowedPreviewUrl,
  previewRequestFilter,
  registerPreviewIpc,
} = require('./preview.js');

function fakeAttach() {
  const navigations = [];
  const redirects = [];
  const loads = [];
  const destroyed = [];
  const views = [];

  function attach({ id, url, bounds, partition, extraHeaders }) {
  const handlers = { navigate: [], redirect: [], request: [], didNavigate: [] };
    const view = {
      id,
      url,
      bounds: bounds ?? null,
      visible: true,
      partition,
      extraHeaders: extraHeaders ?? null,
      webContents: {
        history: [],
        index: -1,
        on(event, listener) {
          if (event === 'will-navigate') handlers.navigate.push(listener);
          if (event === 'will-redirect') handlers.redirect.push(listener);
          if (event === 'did-navigate' || event === 'did-navigate-in-page') handlers.didNavigate.push(listener);
        },
        loadURL(next, options) {
          loads.push({ id, url: next, options: options ?? null });
          view.url = next;
          if (this.index < 0) {
            this.history = [next];
            this.index = 0;
          } else {
            this.history = this.history.slice(0, this.index + 1);
            this.history.push(next);
            this.index = this.history.length - 1;
          }
          for (const listener of handlers.didNavigate) listener();
        },
        getURL() {
          return this.history[this.index] ?? view.url;
        },
        canGoBack() {
          return this.index > 0;
        },
        canGoForward() {
          return this.index < this.history.length - 1;
        },
        goBack() {
          if (this.index > 0) this.index -= 1;
          view.url = this.history[this.index];
          for (const listener of handlers.didNavigate) listener();
        },
        goForward() {
          if (this.index < this.history.length - 1) this.index += 1;
          view.url = this.history[this.index];
          for (const listener of handlers.didNavigate) listener();
        },
        reload() {
          loads.push({ id, url: this.getURL(), options: { reload: true } });
        },
        openDevTools(options) {
          view.devTools = options ?? true;
        },
      },
      setBounds(next) {
        view.bounds = next;
      },
      setVisible(visible) {
        view.visible = visible;
      },
      webRequest: {
        onBeforeRequest(_filter, listener) {
          handlers.request.push(listener);
        },
      },
      destroy() {
        destroyed.push(id);
      },
      emitRequest(next, resourceType = 'mainFrame') {
        let decision = { cancel: false };
        for (const listener of handlers.request) {
          listener({ url: next, resourceType }, (result) => { decision = result; });
        }
        return decision;
      },
      emitNavigate(next) {
        const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
        for (const listener of handlers.navigate) listener(event, next);
        navigations.push({ url: next, prevented: event.defaultPrevented });
        return event;
      },
      emitRedirect(next) {
        const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
        for (const listener of handlers.redirect) listener(event, next);
        redirects.push({ url: next, prevented: event.defaultPrevented });
        return event;
      },
    };
    views.push(view);
    return view;
  }

  return { attach, navigations, redirects, loads, destroyed, views };
}

test('isAllowedPreviewUrl accepts http://127.0.0.1 with any port', () => {
  assert.equal(isAllowedPreviewUrl('http://127.0.0.1:3000'), true);
  assert.equal(isAllowedPreviewUrl('http://127.0.0.1'), true);
  assert.equal(isAllowedPreviewUrl('http://127.0.0.1:8080/app'), true);
});

test('isAllowedPreviewUrl accepts IPv6 loopback with WHATWG brackets', () => {
  assert.equal(isAllowedPreviewUrl('http://[::1]:3000'), true);
  assert.equal(isAllowedPreviewUrl('http://[::1]/app'), true);
});

test('isAllowedPreviewUrl rejects non-local arbitrary URLs', () => {
  assert.equal(isAllowedPreviewUrl('https://example.com'), false);
  assert.equal(isAllowedPreviewUrl('http://evil.example'), false);
  assert.equal(isAllowedPreviewUrl('file:///etc/passwd'), false);
  assert.equal(isAllowedPreviewUrl('javascript:alert(1)'), false);
});

test('isAllowedPreviewUrl accepts 0.0.0.0 and previewOpen rewrites it to 127.0.0.1', async () => {
  assert.equal(isAllowedPreviewUrl('http://0.0.0.0:5173/'), true);
  const fake = fakeAttach();
  const preview = createPreviewController({ attach: fake.attach });
  const result = await preview.open({ url: 'http://0.0.0.0:5173/app' });
  assert.equal(result.ok, true);
  assert.equal(result.url, 'http://127.0.0.1:5173/app');
  assert.deepEqual(fake.loads, [{ id: result.id, url: 'http://127.0.0.1:5173/app', options: null }]);
});

test('previewRequestFilter cancels non-loopback frames but allows remote subresources', () => {
  assert.deepEqual(previewRequestFilter({ url: 'https://example.com/embed', resourceType: 'subFrame' }), { cancel: true });
  assert.deepEqual(previewRequestFilter({ url: 'https://cdn.example/font.woff2', resourceType: 'font' }), { cancel: false });
  assert.deepEqual(previewRequestFilter({ url: 'https://cdn.example/app.js', resourceType: 'script' }), { cancel: false });
  assert.deepEqual(previewRequestFilter({ url: 'http://127.0.0.1:4173/app', resourceType: 'mainFrame' }), { cancel: false });
  assert.deepEqual(previewRequestFilter({ url: 'http://[::1]:3000/', resourceType: 'mainFrame' }), { cancel: false });
  // Missing resourceType is treated as a document navigation (fail closed).
  assert.deepEqual(previewRequestFilter({ url: 'https://example.com/page' }), { cancel: true });
});

test('previewRequestFilter cancels non-loopback subframe URLs', () => {
  assert.deepEqual(previewRequestFilter({ url: 'https://example.com/embed', resourceType: 'subFrame' }), { cancel: true });
  assert.deepEqual(previewRequestFilter({ url: 'http://127.0.0.1:4173/app', resourceType: 'mainFrame' }), { cancel: false });
  assert.deepEqual(previewRequestFilter({ url: 'http://[::1]:3000/', resourceType: 'mainFrame' }), { cancel: false });
});

test('previewOpen succeeds for http://127.0.0.1 and attaches an isolated view', async () => {
  const fake = fakeAttach();
  const preview = createPreviewController({ attach: fake.attach });
  const result = await preview.open({ url: 'http://127.0.0.1:4173', bounds: { x: 10, y: 20, width: 400, height: 300 } });
  assert.equal(result.ok, true);
  assert.equal(typeof result.id, 'string');
  assert.equal(result.url, 'http://127.0.0.1:4173');
  assert.equal(fake.views.length, 1);
  assert.equal(fake.views[0].partition, 'dshd-preview');
  assert.equal(fake.views[0].extraHeaders, null);
  assert.deepEqual(fake.loads, [{ id: result.id, url: 'http://127.0.0.1:4173', options: null }]);
});

test('previewOpen rejects a non-local URL and does not attach a view', async () => {
  const fake = fakeAttach();
  const preview = createPreviewController({ attach: fake.attach });
  const result = await preview.open({ url: 'https://example.com' });
  assert.equal(result.ok, false);
  assert.match(result.message, /local/i);
  assert.equal(fake.views.length, 0);
  assert.equal(fake.loads.length, 0);
});

test('onBeforeRequest denies a remote iframe URL and allows loopback and CDN fonts', async () => {
  const fake = fakeAttach();
  const preview = createPreviewController({ attach: fake.attach });
  const opened = await preview.open({ url: 'http://127.0.0.1:3000' });
  assert.equal(opened.ok, true);
  const view = fake.views[0];
  assert.deepEqual(view.emitRequest('https://example.com/iframe', 'subFrame'), { cancel: true });
  assert.deepEqual(view.emitRequest('http://127.0.0.1:3000/next', 'mainFrame'), { cancel: false });
  assert.deepEqual(view.emitRequest('https://fonts.googleapis.com/css', 'stylesheet'), { cancel: false });
});

test('will-navigate and will-redirect to a non-local host are denied', async () => {
  const fake = fakeAttach();
  const preview = createPreviewController({ attach: fake.attach });
  const opened = await preview.open({ url: 'http://127.0.0.1:3000' });
  assert.equal(opened.ok, true);
  const view = fake.views[0];
  const navigate = view.emitNavigate('https://example.com/steal');
  const redirect = view.emitRedirect('https://evil.example/key');
  assert.equal(navigate.defaultPrevented, true);
  assert.equal(redirect.defaultPrevented, true);
  const local = view.emitNavigate('http://127.0.0.1:3000/next');
  assert.equal(local.defaultPrevented, false);
});

test('previewNavigate rejects leaving the local host', async () => {
  const fake = fakeAttach();
  const preview = createPreviewController({ attach: fake.attach });
  const opened = await preview.open({ url: 'http://127.0.0.1:3000' });
  const denied = await preview.navigate(opened.id, 'https://example.com');
  assert.equal(denied.ok, false);
  assert.equal(fake.loads.length, 1);
  const allowed = await preview.navigate(opened.id, 'http://127.0.0.1:3001');
  assert.equal(allowed.ok, true);
  assert.equal(fake.loads.at(-1).url, 'http://127.0.0.1:3001');
});

test('back, forward, reload, and state follow the guest history', async () => {
  const fake = fakeAttach();
  const preview = createPreviewController({ attach: fake.attach });
  const opened = await preview.open({ url: 'http://127.0.0.1:3000' });
  await preview.navigate(opened.id, 'http://127.0.0.1:3000/app');
  const back = await preview.back(opened.id);
  assert.equal(back.ok, true);
  assert.equal(back.url, 'http://127.0.0.1:3000');
  assert.equal(back.canGoBack, false);
  assert.equal(back.canGoForward, true);
  const forward = await preview.forward(opened.id);
  assert.equal(forward.url, 'http://127.0.0.1:3000/app');
  const reloaded = await preview.reload(opened.id);
  assert.equal(reloaded.ok, true);
  const state = await preview.state(opened.id);
  assert.equal(state.url, 'http://127.0.0.1:3000/app');
  const tools = await preview.openDevTools(opened.id);
  assert.equal(tools.ok, true);
  assert.deepEqual(fake.views[0].devTools, { mode: 'detach' });
});

test('guest did-navigate reports the live URL to onState', async () => {
  const seen = [];
  const fake = fakeAttach();
  const preview = createPreviewController({
    attach: fake.attach,
    onState: (state) => { seen.push(state.url); },
  });
  const opened = await preview.open({ url: 'http://127.0.0.1:3000' });
  assert.equal(seen.at(-1), 'http://127.0.0.1:3000');
  await preview.navigate(opened.id, 'http://127.0.0.1:3000/app');
  assert.equal(seen.at(-1), 'http://127.0.0.1:3000/app');
  await preview.back(opened.id);
  assert.equal(seen.at(-1), 'http://127.0.0.1:3000');
});

test('discoverLocalServers reports the loopback ports the probe accepts', async () => {
  const found = await discoverLocalServers(async (port) => port === 5173 || port === 3000);
  assert.deepEqual(found, [
    { url: 'http://127.0.0.1:3000', port: 3000 },
    { url: 'http://127.0.0.1:5173', port: 5173 },
  ]);
});

test('closeAll destroys every live view', async () => {
  const fake = fakeAttach();
  const preview = createPreviewController({ attach: fake.attach });
  const first = await preview.open({ url: 'http://127.0.0.1:3000' });
  const second = await preview.open({ url: 'http://127.0.0.1:3001' });
  assert.equal(fake.views.length, 2);
  await preview.closeAll();
  assert.deepEqual(fake.destroyed.sort(), [first.id, second.id].sort());
  assert.equal(fake.views.length, 2); // destroy() marks the fake, the table is what cleared
  await assert.rejects(() => preview.navigate(first.id, 'http://127.0.0.1:3000'), /unknown preview id/);
});

test('registerPreviewIpc authorizes state-only requests before dispatch', async () => {
  const handlers = new Map();
  const ipcMain = { handle(channel, fn) { handlers.set(channel, fn); } };
  let authorized = 0;
  const controller = {
    state(id) { return { ok: true, id }; },
  };
  registerPreviewIpc(ipcMain, controller, {
    authorize(event) {
      assert.equal(event.sender.id, 9);
      authorized += 1;
    },
  });
  assert.deepEqual(
    await handlers.get('shell:preview-state')({ sender: { id: 9 } }, 'preview-1'),
    { ok: true, id: 'preview-1' },
  );
  assert.equal(authorized, 1);
});
