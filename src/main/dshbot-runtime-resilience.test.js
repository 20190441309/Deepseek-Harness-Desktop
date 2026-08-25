'use strict';

/**
 * Runtime resilience semantics for dshbot's process-local state:
 *
 * - Room turn epochs (`group-chat-host.js`): stale turn tokens never validate
 *   after a crash restart, and duplicate bumps stay monotonic.
 * - Inbox drain (`inbox-drain.js`): delivery is at-least-once. The assemble
 *   PEEK never mutates the durable catalog; a crash between peek and ack
 *   redelivers instead of dropping; acks are idempotent so a duplicate
 *   injection of the drain listener cannot double-delete; messages that
 *   arrive after the peek survive the ack.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const hostUrl = pathToFileURL(
  path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'lib', 'group-chat-host.js'),
).href;
const drainUrl = pathToFileURL(
  path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'lib', 'inbox-drain.js'),
).href;

/** Import a fresh ESM instance (fresh module-level Maps = crash-restart sim). */
function freshInstance(url, tag) {
  return import(`${url}?restart=${tag}-${Date.now()}`);
}

function makeScope(items) {
  let catalog = { items };
  return {
    get: () => catalog,
    set: (value) => {
      catalog = value;
    },
  };
}

function makeSectionCapture() {
  const sections = [];
  return {
    sections,
    ctx: {
      systemPrompt: {
        section(options) {
          sections.push(options);
        },
      },
    },
  };
}

function inboundMessage(overrides = {}) {
  return {
    fromId: 'sender',
    fromName: 'Sender',
    text: 'hello',
    timestampMs: 111,
    ...overrides,
  };
}

function botWithInbox(inbox) {
  return {
    id: 'b1',
    kind: 'bot',
    sessionId: 'S1',
    name: 'Bot One',
    inbox,
  };
}

const assembleCtx = { agent: { session: { id: 'S1' } } };

test('turn epochs are monotonic and stale tokens never validate after restart', async () => {
  const host = await freshInstance(hostUrl, 'epoch');
  assert.equal(host.currentTurnEpoch('room-1'), 0);
  const first = host.nextTurnEpoch('room-1');
  const isFirstCurrent = host.isCurrentFactory('room-1', first);
  assert.equal(first, 1);
  assert.equal(isFirstCurrent(), true);
  const second = host.nextTurnEpoch('room-1');
  assert.equal(second, 2);
  assert.equal(isFirstCurrent(), false, 'a new user turn invalidates the previous turn token');
  // Rooms are independent.
  assert.equal(host.currentTurnEpoch('room-2'), 0);

  // Crash restart: a brand-new process starts every room at epoch 0, so any
  // epoch token minted before the crash compares stale forever.
  const restarted = await freshInstance(hostUrl, 'epoch-restarted');
  assert.equal(restarted.currentTurnEpoch('room-1'), 0);
  assert.equal(restarted.isCurrentFactory('room-1', second)(), false);
  const afterRestart = restarted.nextTurnEpoch('room-1');
  assert.equal(afterRestart, 1);
  assert.equal(restarted.isCurrentFactory('room-1', second)(), false, 'pre-crash tokens stay stale after new turns');

  restarted.resetTurnEpochsForTests();
  assert.equal(restarted.currentTurnEpoch('room-1'), 0);
});

test('inbox peek never mutates the catalog and ack clears exactly once', async () => {
  const drain = await freshInstance(drainUrl, 'peek-ack');
  const message = inboundMessage();
  const scope = makeScope([botWithInbox([message])]);
  const { ctx, sections } = makeSectionCapture();
  drain.registerInboxDrain(ctx, { getScope: () => scope });
  assert.equal(sections.length, 1);

  const prompt = sections[0].text(assembleCtx);
  assert.match(prompt, /hello/);
  assert.equal(scope.get().items[0].inbox.length, 1, 'peek is read-only on the durable inbox');

  drain.ackPendingInboxDrain(scope, 'b1');
  assert.equal(scope.get().items[0].inbox.length, 0, 'ack removes the peeked batch');

  const before = scope.get();
  drain.ackPendingInboxDrain(scope, 'b1');
  assert.equal(scope.get(), before, 'a second ack is a no-op (idempotent)');
});

test('a crash between peek and ack redelivers the batch (at-least-once)', async () => {
  const message = inboundMessage({ text: 'do not lose me' });
  const scope = makeScope([botWithInbox([message])]);

  const beforeCrash = await freshInstance(drainUrl, 'crash-a');
  const first = makeSectionCapture();
  beforeCrash.registerInboxDrain(first.ctx, { getScope: () => scope });
  assert.match(first.sections[0].text(assembleCtx), /do not lose me/);
  // Crash here: the pendingDrain snapshot dies with the process, no ack runs.

  const afterCrash = await freshInstance(drainUrl, 'crash-b');
  const second = makeSectionCapture();
  afterCrash.registerInboxDrain(second.ctx, { getScope: () => scope });
  assert.match(
    second.sections[0].text(assembleCtx),
    /do not lose me/,
    'the unacked message is redelivered after restart',
  );
  afterCrash.ackPendingInboxDrain(scope, 'b1');
  assert.equal(scope.get().items[0].inbox.length, 0);

  // The pre-crash instance acking late must not corrupt the already-clean inbox.
  beforeCrash.ackPendingInboxDrain(scope, 'b1');
  assert.equal(scope.get().items[0].inbox.length, 0);
});

test('duplicate drain injection peeks the same batch and a single ack settles it', async () => {
  const drain = await freshInstance(drainUrl, 'duplicate');
  const message = inboundMessage({ text: 'once only' });
  const scope = makeScope([botWithInbox([message])]);
  const capture = makeSectionCapture();
  drain.registerInboxDrain(capture.ctx, { getScope: () => scope });
  drain.registerInboxDrain(capture.ctx, { getScope: () => scope });
  assert.equal(capture.sections.length, 2);

  const prompts = capture.sections.map((section) => section.text(assembleCtx));
  assert.match(prompts[0], /once only/);
  assert.match(prompts[1], /once only/);
  assert.equal(scope.get().items[0].inbox.length, 1);

  drain.ackPendingInboxDrain(scope, 'b1');
  assert.equal(scope.get().items[0].inbox.length, 0);
  drain.ackPendingInboxDrain(scope, 'b1');
  assert.equal(scope.get().items[0].inbox.length, 0, 'the duplicate listener cannot double-delete');
});

test('messages arriving between peek and ack survive the ack', async () => {
  const drain = await freshInstance(drainUrl, 'late-arrival');
  const early = inboundMessage({ text: 'early', timestampMs: 100 });
  const late = inboundMessage({ text: 'late', timestampMs: 200 });
  const scope = makeScope([botWithInbox([early])]);
  const capture = makeSectionCapture();
  drain.registerInboxDrain(capture.ctx, { getScope: () => scope });

  assert.match(capture.sections[0].text(assembleCtx), /early/);
  // A new message lands after the peek snapshot, before the ack.
  const catalog = scope.get();
  scope.set({
    ...catalog,
    items: [{ ...catalog.items[0], inbox: [...catalog.items[0].inbox, late] }],
  });

  drain.ackPendingInboxDrain(scope, 'b1');
  const remaining = scope.get().items[0].inbox;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].text, 'late', 'only the peeked batch is acked');

  // The next assemble delivers the late arrival.
  assert.match(capture.sections[0].text(assembleCtx), /late/);
  drain.ackPendingInboxDrain(scope, 'b1');
  assert.equal(scope.get().items[0].inbox.length, 0);
});

test('priority messages are peeked ahead of older non-priority mail', async () => {
  const drain = await freshInstance(drainUrl, 'priority');
  const normal = inboundMessage({ text: 'normal first', timestampMs: 100 });
  const urgent = inboundMessage({ text: 'urgent later', timestampMs: 200, priority: true });
  const scope = makeScope([botWithInbox([normal, urgent])]);
  const capture = makeSectionCapture();
  drain.registerInboxDrain(capture.ctx, { getScope: () => scope });
  const prompt = capture.sections[0].text(assembleCtx);
  assert.ok(
    prompt.indexOf('urgent later') < prompt.indexOf('normal first'),
    'priority mail leads the wake prompt',
  );
  drain.ackPendingInboxDrain(scope, 'b1');
  assert.equal(scope.get().items[0].inbox.length, 0, 'the ack clears both priority and normal mail');
});
