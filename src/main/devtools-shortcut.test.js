const test = require('node:test');
const assert = require('node:assert/strict');

const {
  devToolsShortcutAllowed,
  isDevToolsToggleInput,
  attachDevToolsShortcut,
} = require('./devtools-shortcut');

test('devToolsShortcutAllowed: dev builds always, packaged only with openDevTools', () => {
  assert.equal(devToolsShortcutAllowed({ isPackaged: false }), true);
  assert.equal(devToolsShortcutAllowed({ isPackaged: false, openDevTools: false }), true);
  assert.equal(devToolsShortcutAllowed({ isPackaged: true }), false);
  assert.equal(devToolsShortcutAllowed({ isPackaged: true, openDevTools: false }), false);
  assert.equal(devToolsShortcutAllowed({ isPackaged: true, openDevTools: true }), true);
  assert.equal(devToolsShortcutAllowed({ isPackaged: true, openDevTools: 'yes' }), false);
});

test('isDevToolsToggleInput matches Ctrl+Shift+I and Cmd+Alt+I keyDown only', () => {
  const base = { type: 'keyDown', key: 'I', control: false, shift: false, alt: false, meta: false };
  assert.equal(isDevToolsToggleInput({ ...base, control: true, shift: true }), true);
  assert.equal(isDevToolsToggleInput({ ...base, key: 'i', control: true, shift: true }), true);
  assert.equal(isDevToolsToggleInput({ ...base, meta: true, alt: true }), true);
  // Wrong chords / keys / phases.
  assert.equal(isDevToolsToggleInput({ ...base, control: true }), false);
  assert.equal(isDevToolsToggleInput({ ...base, shift: true }), false);
  assert.equal(isDevToolsToggleInput({ ...base, control: true, shift: true, alt: true }), false);
  assert.equal(isDevToolsToggleInput({ ...base, control: true, shift: true, key: 'J' }), false);
  assert.equal(isDevToolsToggleInput({ ...base, control: true, shift: true, type: 'keyUp' }), false);
  assert.equal(isDevToolsToggleInput(null), false);
});

function fakeContents() {
  const listeners = {};
  return {
    listeners,
    on(name, handler) {
      listeners[name] = handler;
    },
    emitInput(input) {
      const event = { prevented: false, preventDefault() { this.prevented = true; } };
      listeners['before-input-event']?.(event, input);
      return event;
    },
  };
}

test('attachDevToolsShortcut toggles the resolved target only when allowed', () => {
  const contents = fakeContents();
  let allowed = false;
  const target = { toggles: 0, toggleDevTools() { this.toggles += 1; } };
  attachDevToolsShortcut(contents, {
    allowed: () => allowed,
    resolveTarget: () => target,
  });
  const chord = { type: 'keyDown', key: 'I', control: true, shift: true, alt: false, meta: false };

  const blocked = contents.emitInput(chord);
  assert.equal(target.toggles, 0);
  assert.equal(blocked.prevented, false);

  allowed = true;
  const passed = contents.emitInput(chord);
  assert.equal(target.toggles, 1);
  assert.equal(passed.prevented, true);

  // Non-matching input never resolves the target.
  contents.emitInput({ type: 'keyDown', key: 'A', control: true, shift: true });
  assert.equal(target.toggles, 1);
});

test('attachDevToolsShortcut survives a missing target', () => {
  const contents = fakeContents();
  attachDevToolsShortcut(contents, { allowed: () => true, resolveTarget: () => null });
  assert.doesNotThrow(() => {
    contents.emitInput({ type: 'keyDown', key: 'I', control: true, shift: true });
  });
});
