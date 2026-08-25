'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const messagingUrl = pathToFileURL(
  path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'lib', 'agent-messaging.js'),
).href;
const memoryUrl = pathToFileURL(
  path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'lib', 'memory.js'),
).href;

test('clampAgentMessage trims and caps length', async () => {
  const { clampAgentMessage, AGENT_MESSAGE_MAX_TEXT } = await import(messagingUrl);
  assert.equal(clampAgentMessage('  hi  '), 'hi');
  assert.equal(clampAgentMessage(''), '');
  assert.equal(clampAgentMessage('x'.repeat(AGENT_MESSAGE_MAX_TEXT + 10)).length, AGENT_MESSAGE_MAX_TEXT);
});

test('prioritizeAgentInbound puts priority first', async () => {
  const { prioritizeAgentInbound, mergeAgentInboundQueue, enqueueAgentInbound } = await import(messagingUrl);
  const messages = [
    { text: 'a', priority: false },
    { text: 'b', priority: true },
    { text: 'c', priority: false },
  ];
  assert.deepEqual(prioritizeAgentInbound(messages).map((m) => m.text), ['b', 'a', 'c']);
  const merged = mergeAgentInboundQueue(
    [{ text: 'n', priority: true }, { text: 'nr' }],
    [{ text: 'o', priority: true }, { text: 'or' }],
  );
  assert.deepEqual(merged.map((m) => m.text), ['n', 'o', 'or', 'nr']);
  assert.deepEqual(enqueueAgentInbound([{ text: 'q' }], { text: 'p', priority: true }).map((m) => m.text), ['p', 'q']);
});

test('resolveSendToAgentTarget rejects self and allows group targets', async () => {
  const { resolveSendToAgentTarget } = await import(messagingUrl);
  const items = [
    { id: 'a', kind: 'bot', name: 'A' },
    { id: 'b', kind: 'bot', name: 'B' },
    { id: 'r', kind: 'room', name: 'Room' },
  ];
  assert.equal(resolveSendToAgentTarget(items, 'a', 'a').ok, false);
  const group = resolveSendToAgentTarget(items, 'a', 'r');
  assert.equal(group.ok, true);
  assert.equal(group.toGroup, true);
  assert.equal(resolveSendToAgentTarget(items, 'a', 'b').ok, true);
});

test('buildAgentInboundWakePrompt includes cue segments', async () => {
  const { buildAgentInboundWakePrompt } = await import(messagingUrl);
  const text = buildAgentInboundWakePrompt({
    fromId: 'a',
    fromName: 'Alice',
    text: 'hello there',
    timestampMs: 1,
    priority: true,
  });
  assert.match(text, /\[agent\]/);
  assert.match(text, /Alice/);
  assert.match(text, /hello there/);
  assert.match(text, /PRIORITY/);
});

test('inbox drain host does not clear catalog inside systemPrompt assemble', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'lib', 'send-to-agent.js'),
    'utf8',
  );
  assert.match(src, /name: 'dshbot:inbox'/);
  assert.match(src, /pendingDrain\.set/);
  assert.match(src, /export function ackPendingInboxDrain/);
  assert.equal(/text:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?scope\.set\(/.test(src), false);
  const indexSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'lib', 'index.js'),
    'utf8',
  );
  assert.match(indexSrc, /ackPendingInboxDrain\(scope, bot\.id\)/);
});

test('memory read/write round-trips under a temp home', async () => {
  const { readBotMemory, writeBotMemory, composePersonaWithMemory, memoryFilePath } = await import(memoryUrl);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dshbot-mem-'));
  try {
    assert.equal(readBotMemory(home, 'bot-1'), '');
    writeBotMemory(home, 'bot-1', '- likes UTC\n');
    assert.equal(readBotMemory(home, 'bot-1'), '- likes UTC\n');
    assert.ok(fs.existsSync(memoryFilePath(home, 'bot-1')));
    assert.match(composePersonaWithMemory('You are X.', '- likes UTC'), /Durable notes/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('buildAgentDirectoryPrompt lists teammates and rooms, hides hidden bots', async () => {
  const { buildAgentDirectoryPrompt, AGENT_DIRECTORY_PROMPT_LIMIT } = await import(messagingUrl);
  const items = [
    { id: 'a', kind: 'bot', name: 'Alice', description: 'planner' },
    { id: 'b', kind: 'bot', name: 'Bob', description: '' },
    { id: 'c', kind: 'bot', name: 'Carol', description: 'secret', hidden: true },
    { id: 'r1', kind: 'room', name: 'Ship room', memberBotIds: ['a', 'b'] },
    { id: 'r2', kind: 'room', name: 'Other room', memberBotIds: ['b'] },
  ];
  const text = buildAgentDirectoryPrompt(items, 'a');
  assert.match(text, /Bob \(id: b\)/);
  assert.match(text, /Ship room \(id: r1\)/);
  assert.match(text, /send_to_agent/);
  assert.doesNotMatch(text, /Carol/);
  assert.doesNotMatch(text, /Alice \(id: a\)/);
  assert.doesNotMatch(text, /Other room/);
  assert.equal(typeof AGENT_DIRECTORY_PROMPT_LIMIT, 'number');
  // Alone with no rooms: no section at all.
  assert.equal(buildAgentDirectoryPrompt([items[0]], 'a'), '');
});

test('index.js wires the teammates directory into the 1:1 system prompt', () => {
  const indexSrc = fs.readFileSync(
    path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'lib', 'index.js'),
    'utf8',
  );
  assert.match(indexSrc, /name: 'dshbot:teammates'/);
  assert.match(indexSrc, /buildAgentDirectoryPrompt\(items, bot\.id\)/);
});
