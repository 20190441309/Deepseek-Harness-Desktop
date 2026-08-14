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

test('injected chrome script can be evaluated twice in one realm', () => {
  const context = vm.createContext(createInjectSandbox());
  assert.doesNotThrow(() => vm.runInContext(injectSource, context));
  assert.doesNotThrow(() => vm.runInContext(injectSource, context));
});

function createInjectSandbox() {
  class HTMLElement {}
  const store = new Map();
  const html = makeElement('html');
  const body = makeElement('body');
  store.set('html', html);
  store.set('body', body);

  function makeElement(id) {
    const node = Object.assign(Object.create(HTMLElement.prototype), {
      id: id || '',
      style: {
        setProperty() {},
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
        return { top: 12, left: 0, width: 0, height: 32 };
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
