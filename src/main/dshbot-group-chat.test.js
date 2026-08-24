/**
 * Grok-aligned group-chat pure protocol + orchestrator + host helpers.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../../vendor/dshbot/lib');

async function load(name) {
  return import(pathToFileURL(path.join(root, name)).href);
}

test('orderRoundSpeakers rotates by round', async () => {
  const { orderRoundSpeakers } = await load('group-chat.js');
  assert.deepEqual(orderRoundSpeakers(['a', 'b', 'c'], 0), ['a', 'b', 'c']);
  assert.deepEqual(orderRoundSpeakers(['a', 'b', 'c'], 1), ['b', 'c', 'a']);
  assert.deepEqual(orderRoundSpeakers(['a', 'b', 'c'], 2), ['c', 'a', 'b']);
});

test('parseGroupMentions uses word boundaries and everyone', async () => {
  const { parseGroupMentions } = await load('group-chat.js');
  const members = [
    { id: 'a', name: 'Alice' },
    { id: 'b', name: 'Bob' },
  ];
  assert.equal(parseGroupMentions('hi @Alice', members).memberIds.includes('a'), true);
  assert.equal(parseGroupMentions('see malice later', members).memberIds.includes('a'), false);
  assert.equal(parseGroupMentions('@everyone hello', members).isEveryone, true);
  assert.equal(parseGroupMentions('hey @all', members).isEveryone, true);
});

test('resolveResponders uses last user window and peer-equal all when no mention', async () => {
  const { resolveResponders } = await load('group-chat.js');
  const members = [
    { id: 'a', name: 'A', description: '' },
    { id: 'b', name: 'B', description: '' },
  ];
  const all = resolveResponders(members, [
    { speaker: { kind: 'user' }, content: '你们好啊' },
  ]);
  assert.deepEqual(all.map((m) => m.id), ['a', 'b']);
  const onlyB = resolveResponders(members, [
    { speaker: { kind: 'user' }, content: '@B only you' },
  ]);
  assert.deepEqual(onlyB.map((m) => m.id), ['b']);
});

test('messagesSinceMemberLastSpoke slices after last member line', async () => {
  const { messagesSinceMemberLastSpoke } = await load('group-chat.js');
  const history = [
    { speaker: { kind: 'user' }, content: 'hi' },
    { speaker: { kind: 'member', id: 'a', name: 'A' }, content: 'yo' },
    { speaker: { kind: 'user' }, content: 'again' },
  ];
  const since = messagesSinceMemberLastSpoke(history, 'a');
  assert.equal(since.length, 1);
  assert.equal(since[0].content, 'again');
});

test('buildGroupTurnPrompt has no later-seat pass bias', async () => {
  const { buildGroupTurnPrompt, buildGroupMemberSystemPrompt } = await load('group-chat.js');
  const member = { id: 'b', name: 'Bot2', description: 'reviewer' };
  const peers = [{ id: 'a', name: 'Bot1', description: '' }];
  const group = { name: 'Room', description: '' };
  const prompt = buildGroupTurnPrompt({
    member,
    group,
    peers,
    newMessages: [{ speaker: { kind: 'user' }, content: '你们好啊' }],
  });
  assert.match(prompt, /It's your turn, Bot2/);
  assert.match(prompt, /send_room_message/);
  assert.match(prompt, /\(pass\)/);
  assert.doesNotMatch(prompt, /Earlier members already answered/);
  assert.doesNotMatch(prompt, /first member/);
  const system = buildGroupMemberSystemPrompt(member, group, peers);
  assert.match(system, /You are Bot2/);
  assert.doesNotMatch(system, /default action is to add nothing/);
});

test('isPassContent and isPotentialPassPrefix', async () => {
  const { isPassContent, isPotentialPassPrefix } = await load('group-chat.js');
  assert.equal(isPassContent('(pass)'), true);
  assert.equal(isPassContent('hello'), false);
  assert.equal(isPotentialPassPrefix('(pa'), true);
  assert.equal(isPotentialPassPrefix('Hello'), false);
});

test('GroupChatOrchestrator stops on all-pass round and caps messages', async () => {
  const { GroupChatOrchestrator } = await load('group-chat-orchestrator.js');
  const posted = [];
  let epoch = 1;
  const members = [
    { id: 'a', name: 'A', description: '' },
    { id: 'b', name: 'B', description: '' },
  ];
  const history = [{ speaker: { kind: 'user' }, content: 'hi' }];
  const orch = new GroupChatOrchestrator({
    resolveMembers: async () => members,
    readHistory: () => history,
    isCurrent: () => epoch === 1,
    runMemberTurn: async () => ['(pass)'],
    postMemberMessage: (member, content) => posted.push({ id: member.id, content }),
  });
  await orch.run({ group: { name: 'G' }, memberIds: ['a', 'b'] });
  assert.deepEqual(posted, []);

  const spoken = [];
  const orch2 = new GroupChatOrchestrator({
    resolveMembers: async () => members,
    readHistory: () => history,
    isCurrent: () => true,
    runMemberTurn: async ({ member }) => [`hi from ${member.name}`, 'second', 'third'],
    postMemberMessage: (member, content) => spoken.push(content),
  });
  await orch2.run({ group: { name: 'G' }, memberIds: ['a', 'b'] });
  // 2 members × 2 max messages per turn, then another round until caps / all-pass
  assert.ok(spoken.length >= 2);
  assert.ok(spoken.every((text) => !/third/.test(text)));
});

test('planCreateGroup requires one member and opens duplicate set', async () => {
  const { planCreateGroup, SandGroupCreateError } = await load('group-chat-host.js');
  const items = [
    { id: 'a', kind: 'bot', name: 'A' },
    { id: 'b', kind: 'bot', name: 'B' },
    { id: 'r1', kind: 'room', name: 'G', memberBotIds: ['a', 'b'] },
  ];
  assert.throws(
    () => planCreateGroup({ name: 'x', memberIds: [], items }),
    SandGroupCreateError,
  );
  const open = planCreateGroup({ name: 'x', memberIds: ['b', 'a'], items });
  assert.equal(open.action, 'open');
  assert.equal(open.room.id, 'r1');
  const create = planCreateGroup({ name: 'New', memberIds: ['a'], items });
  assert.equal(create.action, 'create');
  assert.deepEqual(create.memberIds, ['a']);
});

test('turn epoch bumps and isCurrent flips', async () => {
  const {
    nextTurnEpoch,
    isCurrentFactory,
    resetTurnEpochsForTests,
  } = await load('group-chat-host.js');
  resetTurnEpochsForTests();
  const e1 = nextTurnEpoch('room-1');
  const current = isCurrentFactory('room-1', e1);
  assert.equal(current(), true);
  nextTurnEpoch('room-1');
  assert.equal(current(), false);
});

test('resolveSendToAgentTarget allows group ids', async () => {
  const { resolveSendToAgentTarget, buildAgentInboundWakePrompt } = await load('agent-messaging.js');
  const items = [
    { id: 'a', kind: 'bot', name: 'A' },
    { id: 'g', kind: 'room', name: 'Group' },
  ];
  const ok = resolveSendToAgentTarget(items, 'a', 'g');
  assert.equal(ok.ok, true);
  assert.equal(ok.toGroup, true);
  const wake = buildAgentInboundWakePrompt({
    fromId: 'a',
    fromName: 'A',
    text: 'ping',
    timestampMs: 1,
    priority: true,
  });
  assert.match(wake, /\[agent\]/);
  assert.match(wake, /PRIORITY/);
  assert.match(wake, /A: ping/);
});
