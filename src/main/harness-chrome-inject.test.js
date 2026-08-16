const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { dshReservedRight, dshWindowControlsRight } = require('./harness-chrome-metrics.js');

const injectSource = fs.readFileSync(path.join(__dirname, 'harness-chrome-inject.js'), 'utf8');

test('reservedRight is only window controls when the trailing cluster is empty', () => {
  assert.equal(dshReservedRight(0), dshWindowControlsRight());
  assert.equal(dshReservedRight(undefined), dshWindowControlsRight());
});

test('reservedRight grows by the measured trailing cluster plus a cluster gap', () => {
  const controls = dshWindowControlsRight();
  assert.equal(dshReservedRight(72), controls + 72 + 8);
  assert.ok(dshReservedRight(72) > controls);
});

test('injected chrome script is a re-runnable IIFE with no Node exports', () => {
  assert.match(injectSource.trimStart(), /^\(\(\)\s*=>/);
  assert.doesNotMatch(injectSource, /module\.exports/);
  assert.doesNotMatch(injectSource, /^const /m);
  assert.doesNotMatch(injectSource, /^function /m);
});

test('injected window controls follow official label and hover tokens', () => {
  assert.match(injectSource, /color:\s*var\(--dsw-alias-label-primary\)/);
  assert.match(injectSource, /background:\s*var\(--dsw-alias-interactive-bg-hover\)/);
  assert.doesNotMatch(injectSource, /--dsh-ctrl-fg/);
  assert.doesNotMatch(injectSource, /--dsh-ctrl-hover/);
});

test('injected chrome script omits the marketplace window-control', () => {
  assert.doesNotMatch(injectSource, /插件市场/);
  assert.doesNotMatch(injectSource, /data-act="marketplace"/);
});

test('injected chrome script uses an 8px drag gutter and does not mark the header as drag', () => {
  assert.match(injectSource, /\[data-titlebar-row\]/);
  assert.match(injectSource, /findTitlebarRow/);
  assert.match(injectSource, /const DRAG_GUTTER = 8/);
  assert.match(injectSource, /placeDragGutter/);
  assert.doesNotMatch(injectSource, /height: 56px/);
  assert.doesNotMatch(injectSource, /setAttribute\(MARK, 'main'\)/);
  assert.doesNotMatch(injectSource, /logo\.setAttribute\(MARK/);
});

test('injected chrome script can be evaluated twice in one realm', () => {
  const context = vm.createContext(createInjectSandbox());
  assert.doesNotThrow(() => vm.runInContext(injectSource, context));
  assert.doesNotThrow(() => vm.runInContext(injectSource, context));
});

test('injected measure grows --dsh-wco-pad by the trailing cluster plus a gap', () => {
  const cssVars = {};
  const context = vm.createContext(createInjectSandbox({ trailingWidth: 72, cssVars }));
  vm.runInContext(injectSource, context);
  const controls = dshWindowControlsRight();
  assert.equal(cssVars['--dsh-wco-controls'], `${controls}px`);
  assert.equal(cssVars['--dsh-wco-pad'], `${controls + 72 + 8}px`);
});

function createInjectSandbox(options = {}) {
  const trailingWidth = options.trailingWidth ?? 0;
  const cssVars = options.cssVars ?? {};
  class HTMLElement {}
  const store = new Map();
  const html = makeElement('html');
  const body = makeElement('body');
  store.set('html', html);
  store.set('body', body);
  if (trailingWidth > 0) {
    makeElement('dsh-shell-titlebar-trailing');
  }

  function makeElement(id) {
    const node = Object.assign(Object.create(HTMLElement.prototype), {
      id: id || '',
      style: {
        setProperty(name, value) {
          cssVars[name] = value;
        },
        right: '',
        gap: '',
        height: '',
        padding: '',
        top: '',
        left: '',
        marginRight: '',
      },
      innerHTML: '',
      textContent: '',
      className: '',
      dataset: {},
      children: [],
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      addEventListener() {},
      setAttribute() {},
      removeAttribute() {},
      getAttribute() {
        return null;
      },
      getBoundingClientRect() {
        const width = this.id === 'dsh-shell-titlebar-trailing' ? trailingWidth : 0;
        return { top: 12, left: 0, width, height: 32 };
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      matches() {
        return false;
      },
      closest() {
        return null;
      },
      remove() {
        if (this.id) {
          store.delete(this.id);
        }
      },
      getContext() {
        return {
          fillStyle: '#000000',
        };
      },
    });
    if (id) {
      store.set(id, node);
    }
    return node;
  }

  const document = {
    documentElement: html,
    body,
    getElementById(id) {
      return store.get(id) || null;
    },
    createElement() {
      return makeElement();
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  class MutationObserver {
    observe() {}
  }

  const window = {
    __dshShellChromeBound: false,
    __dshShellMaximized: false,
    innerWidth: 1280,
    shell: null,
    addEventListener() {},
    clearTimeout() {},
    setTimeout() {
      return 0;
    },
    MutationObserver,
  };

  return {
    document,
    window,
    HTMLElement,
    MutationObserver,
    getComputedStyle() {
      return { backgroundColor: 'transparent' };
    },
  };
}
