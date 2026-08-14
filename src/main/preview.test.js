const test = require('node:test');
const assert = require('node:assert/strict');
const { createPreviewController, isAllowedPreviewUrl } = require('./preview.js');

function fakeAttach() {
  const navigations = [];
  const redirects = [];
  const loads = [];
  const destroyed = [];
  const views = [];

  function attach({ id, url, bounds, partition, extraHeaders }) {
    const handlers = { navigate: [], redirect: [] };
    const view = {
      id,
      url,
      bounds: bounds ?? null,
      visible: true,
      partition,
      extraHeaders: extraHeaders ?? null,
      webContents: {
        on(event, listener) {
          if (event === 'will-navigate') handlers.navigate.push(listener);
          if (event === 'will-redirect') handlers.redirect.push(listener);
        },
        loadURL(next, options) {
          loads.push({ id, url: next, options: options ?? null });
          view.url = next;
        },
      },
      setBounds(next) {
        view.bounds = next;
      },
      setVisible(visible) {
        view.visible = visible;
      },
      destroy() {
        destroyed.push(id);
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

test('isAllowedPreviewUrl rejects non-local arbitrary URLs', () => {
  assert.equal(isAllowedPreviewUrl('https://example.com'), false);
  assert.equal(isAllowedPreviewUrl('http://evil.example'), false);
  assert.equal(isAllowedPreviewUrl('file:///etc/passwd'), false);
  assert.equal(isAllowedPreviewUrl('javascript:alert(1)'), false);
});

test('previewOpen succeeds for http://127.0.0.1 and attaches an isolated view', async () => {
  const fake = fakeAttach();
  const preview = createPreviewController({ attach: fake.attach });
  const result = await preview.open({ url: 'http://127.0.0.1:4173', bounds: { x: 10, y: 20, width: 400, height: 300 } });
  assert.equal(result.ok, true);
  assert.equal(typeof result.id, 'string');
  assert.equal(result.url, 'http://127.0.0.1:4173');
  assert.equal(fake.views.length, 1);
  assert.equal(fake.views[0].partition, 'dsh-preview');
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
