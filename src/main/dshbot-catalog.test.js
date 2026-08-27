'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const catalogUrl = pathToFileURL(
  path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'lib', 'catalog.js'),
).href;

async function loadCatalog() {
  return import(catalogUrl);
}

test('filterItems matches name and title case-insensitively', async () => {
  const { filterItems } = await loadCatalog();
  const items = [
    { id: '1', kind: 'bot', name: '翻译官', title: 'Translator', description: '' },
    { id: '2', kind: 'room', name: '产品群', title: '', description: '' },
    { id: '3', kind: 'bot', name: '代码助手', title: 'Coder', description: 'reviews diffs' },
  ];
  assert.deepEqual(filterItems(items, '译').map((item) => item.id), ['1']);
  assert.deepEqual(filterItems(items, 'CODER').map((item) => item.id), ['3']);
  assert.deepEqual(filterItems(items, '  ').map((item) => item.id), ['1', '2', '3']);
});

test('avatarInitial uses the first non-space character', async () => {
  const { avatarInitial } = await loadCatalog();
  assert.equal(avatarInitial('翻译官'), '翻');
  assert.equal(avatarInitial('  bot'), 'b');
  assert.equal(avatarInitial(''), '?');
});

test('avatarHue is stable for the same name', async () => {
  const { avatarHue } = await loadCatalog();
  assert.equal(avatarHue('翻译官'), avatarHue('翻译官'));
  assert.notEqual(avatarHue('翻译官'), avatarHue('代码助手'));
  assert.ok(avatarHue('x') >= 0 && avatarHue('x') < 6);
});

test('canChangeWorkspace is only true for blank sessions', async () => {
  const { canChangeWorkspace } = await loadCatalog();
  assert.equal(canChangeWorkspace({ blank: true }), true);
  assert.equal(canChangeWorkspace({ blank: false }), false);
  assert.equal(canChangeWorkspace(undefined), false);
});

test('upsertItem replaces by id and touchItem updates the timestamp', async () => {
  const { upsertItem, touchItem } = await loadCatalog();
  const first = { id: 'a', name: '一', updatedAt: 1 };
  const items = upsertItem([], first);
  const next = upsertItem(items, { ...first, name: '二', updatedAt: 2 });
  assert.equal(next.length, 1);
  assert.equal(next[0].name, '二');
  const touched = touchItem(next, 'a', 9);
  assert.equal(touched[0].updatedAt, 9);
});

test('removeItem drops the matching id', async () => {
  const { removeItem } = await loadCatalog();
  const items = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(removeItem(items, 'a').map((item) => item.id), ['b']);
});

test('emptyRoster lists room members or the 1:1 bot for a catalog session', async () => {
  const { emptyRoster } = await loadCatalog();
  const botA = { id: 'bot-a', kind: 'bot', sessionId: 's-a', name: '翻译官' };
  const botB = { id: 'bot-b', kind: 'bot', sessionId: 's-b', name: '代码助手' };
  const room = {
    id: 'room', kind: 'room', sessionId: 's-room', name: '产品群',
    memberBotIds: ['bot-a', 'ghost', 'bot-b'],
  };
  const items = [botA, room, botB];
  assert.equal(emptyRoster(items, undefined), null);
  assert.equal(emptyRoster(items, 'missing'), null);
  assert.deepEqual(emptyRoster(items, 's-a').map((item) => item.id), ['bot-a']);
  assert.deepEqual(emptyRoster(items, 's-room').map((item) => item.id), ['bot-a', 'bot-b']);
});

test('personaText injects only 1:1 bot descriptions for the live session', async () => {
  const { personaText } = await loadCatalog();
  const items = [
    { id: 'bot', kind: 'bot', sessionId: 's-bot', description: '你是翻译官。' },
    { id: 'room', kind: 'room', sessionId: 's-room', description: 'ignore', memberBotIds: ['bot'] },
  ];
  assert.equal(personaText(items, 's-bot'), '你是翻译官。');
  assert.equal(personaText(items, 's-room'), '');
  assert.equal(personaText(items, 'missing'), '');
  assert.equal(personaText([], 'orphan', 'dshbot-room'), '');
});

test('resolveAskTarget requires a room parent and a member bot', async () => {
  const { resolveAskTarget } = await loadCatalog();
  const items = [
    {
      id: 'room',
      kind: 'room',
      sessionId: 's-room',
      memberBotIds: ['bot-a', 'ghost'],
    },
    {
      id: 'bot-a',
      kind: 'bot',
      sessionId: 's-bot',
      name: '翻译官',
      description: '译',
      model: { provider: 'deepseek', model: 'deepseek-v4-pro' },
    },
    { id: 'bot-b', kind: 'bot', sessionId: 's-other', name: '外人' },
  ];
  const hit = resolveAskTarget(items, 's-room', 'bot-a');
  assert.equal(hit.bot.name, '翻译官');
  assert.equal(resolveAskTarget(items, 's-room', '翻译官').bot.id, 'bot-a');
  assert.throws(() => resolveAskTarget(items, 's-room', 'bot-b'), /not a member/);
  assert.throws(() => resolveAskTarget(items, 's-room', 'ghost'), /unknown bot/);
  assert.throws(() => resolveAskTarget(items, 's-bot', 'bot-a'), /not a room/);
});

test('memberDisplayName maps catalog id or unique member name to the display name', async () => {
  const { memberDisplayName } = await loadCatalog();
  const items = [
    { id: 'bot-a', kind: 'bot', name: '翻译官' },
    { id: 'bot-b', kind: 'bot', name: '算术助手' },
  ];
  assert.equal(memberDisplayName(items, 'bot-a'), '翻译官');
  assert.equal(memberDisplayName(items, '算术助手'), '算术助手');
  assert.equal(memberDisplayName(items, 'missing'), 'missing');
});

test('childPersonaText is peer-equal Grok system prompt without later-seat bias', async () => {
  const { childPersonaText } = await loadCatalog();
  const text = childPersonaText({
    id: 'bot-a',
    name: '翻译官',
    description: '你是中英翻译。只输出译文。',
  }, [
    { id: 'bot-b', name: '算术助手' },
    { id: 'bot-c', name: '诗词机器人' },
  ], { group: { name: '产品群', description: '' } });
  assert.match(text, /You are 翻译官/);
  assert.match(text, /只输出译文/);
  assert.match(text, /算术助手/);
  assert.match(text, /send_room_message/);
  assert.match(text, /\(pass\)/);
  assert.doesNotMatch(text, /NEXT: pass/);
  assert.doesNotMatch(text, /Earlier members already answered/);
  assert.doesNotMatch(text, /default action is to add nothing/);
  assert.doesNotMatch(text, /no distinct expertise/);
});

test('roomTurnPromptForSpeaker is peer-equal for second member', async () => {
  const { roomTurnPromptForSpeaker } = await loadCatalog();
  const items = roomCatalog();
  const room = items.find((entry) => entry.kind === 'room');
  const prompt = roomTurnPromptForSpeaker(items, room, [
    userSaid('你们好啊'),
    asked('c1', 'a'),
    answered('c1', '嗨'),
  ], 'b');
  assert.match(prompt, /It's your turn, 2/);
  assert.match(prompt, /send_room_message/);
  assert.doesNotMatch(prompt, /Earlier members already answered/);
  assert.doesNotMatch(prompt, /first member/);
});
test('lastAssistantText reads the last non-empty assistant message', async () => {
  const { lastAssistantText, lastAssistantTextFromEvents, lastAssistantSeqFromEvents } = await loadCatalog();
  assert.equal(lastAssistantText([
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'one' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'two' }] },
  ]), 'two');
  assert.equal(lastAssistantText([]), '');
  assert.equal(lastAssistantTextFromEvents([
    { type: 'user/message', data: { content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } } },
    { type: 'assistant/message', data: { content: [{ type: 'text', text: 'one' }] } },
    { type: 'assistant/message', data: { content: [{ type: 'text', text: 'two' }] } },
  ]), 'two');
  assert.equal(lastAssistantTextFromEvents([]), '');
  assert.equal(lastAssistantSeqFromEvents([
    { type: 'assistant/message', seq: 3, data: { content: [{ type: 'text', text: 'one' }] } },
    { type: 'assistant/message', seq: 9, data: { content: [{ type: 'text', text: 'two' }] } },
  ]), 9);
  assert.equal(lastAssistantSeqFromEvents([
    { type: 'assistant/message', seq: 3, data: { content: [{ type: 'text', text: 'one' }] } },
    { type: 'assistant/message', seq: 9, data: { content: [] } },
  ]), 3);
  assert.equal(lastAssistantSeqFromEvents([]), -1);
});

test('lastUserText reads the last non-empty user message', async () => {
  const { lastUserText } = await loadCatalog();
  assert.equal(lastUserText([
    { role: 'user', content: [{ type: 'text', text: 'first' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
    { role: 'user', content: [{ type: 'text', text: 'hello 群里' }] },
  ]), 'hello 群里');
  assert.equal(lastUserText([]), '');
});

test('roomSpeakerIds uses @mentions otherwise every member', async () => {
  const { roomSpeakerIds, parseGroupMentions } = await loadCatalog();
  const items = [
    { id: 'a', kind: 'bot', name: '翻译官' },
    { id: 'b', kind: 'bot', name: '算术助手' },
    { id: 'c', kind: 'bot', name: '诗词机器人' },
  ];
  const members = ['a', 'b', 'c'];
  assert.deepEqual(roomSpeakerIds(items, members, '大家好'), ['a', 'b', 'c']);
  assert.deepEqual(roomSpeakerIds(items, members, '@翻译官 这句话'), ['a']);
  assert.deepEqual(roomSpeakerIds(items, members, '@算术助手 和 @诗词机器人'), ['b', 'c']);
  assert.deepEqual(roomSpeakerIds(items, members, '@everyone 开会'), ['a', 'b', 'c']);
  assert.deepEqual(parseGroupMentions(items, members, '@all 同步').botIds, ['a', 'b', 'c']);
  assert.equal(parseGroupMentions(items, members, '@all 同步').everyone, true);
});

function roomCatalog() {
  return [
    {
      id: 'room',
      kind: 'room',
      sessionId: 's-room',
      memberBotIds: ['a', 'b', 'c'],
    },
    { id: 'a', kind: 'bot', sessionId: 's-a', name: '1' },
    { id: 'b', kind: 'bot', sessionId: 's-b', name: '2' },
    { id: 'c', kind: 'bot', sessionId: 's-c', name: '3' },
  ];
}

function userSaid(text) {
  return {
    type: 'user/message',
    data: {
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    },
  };
}

function asked(callId, botId) {
  return {
    type: 'tool/call',
    data: {
      callId,
      name: 'ask_participant',
      arguments: JSON.stringify({ botId, instruction: '你好啊' }),
    },
  };
}

function answered(callId, text) {
  return answeredMany(callId, [text]);
}

// One rendered text block per send_room_message delivery (Grok parity).
function answeredMany(callId, texts) {
  return {
    type: 'tool/result',
    data: {
      message: {
        source: { kind: 'tool', callId },
        content: [{
          type: 'tool-result',
          toolCallId: callId,
          content: texts.map((text) => ({ type: 'text', text })),
        }],
      },
    },
  };
}

test('groupTranscript folds named user and member lines in log order', async () => {
  const { groupTranscript } = await loadCatalog();
  const items = roomCatalog();
  assert.equal(groupTranscript([
    userSaid('你好啊'),
    asked('c1', 'a'),
    answered('c1', '嗨'),
    asked('c2', 'b'),
    answered('c2', '我也在'),
  ], items), [
    '[用户]',
    '你好啊',
    '[1]',
    '嗨',
    '[2]',
    '我也在',
  ].join('\n'));
});

test('two same-turn deliveries stay separate history entries (Grok parity)', async () => {
  const { eventsToGroupHistory, groupTranscript } = await loadCatalog();
  const items = roomCatalog();
  const events = [
    userSaid('请讨论'),
    asked('c1', 'a'),
    answeredMany('c1', ['第一条', '第二条']),
  ];
  const history = eventsToGroupHistory(events, items);
  assert.deepEqual(history, [
    { speaker: { kind: 'user' }, content: '请讨论' },
    { speaker: { kind: 'member', id: 'a', name: '1' }, content: '第一条' },
    { speaker: { kind: 'member', id: 'a', name: '1' }, content: '第二条' },
  ]);
  assert.equal(groupTranscript(events, items), [
    '[用户]',
    '请讨论',
    '[1]',
    '第一条',
    '[1]',
    '第二条',
  ].join('\n'));
  // A pass block among deliveries is still silent.
  assert.equal(
    eventsToGroupHistory([
      userSaid('请讨论'),
      asked('c1', 'a'),
      answeredMany('c1', ['(pass)', '真话']),
    ], items).filter((message) => message.speaker.kind === 'member').length,
    1,
  );
});

test('parseRoomNext / stripRoomNext only strip legacy NEXT for display', async () => {
  const { parseRoomNext, stripRoomNext } = await loadCatalog();
  assert.deepEqual(parseRoomNext('没有控制行'), { kind: 'pass', names: [], visible: '没有控制行' });
  assert.equal(stripRoomNext('嗨\nNEXT: pass'), '嗨');
  assert.equal(stripRoomNext('NEXT: pass'), '');
  assert.equal(stripRoomNext('方案A\nNEXT: all'), '方案A');
});

test('groupTranscript omits pass replies and legacy NEXT footers', async () => {
  const { groupTranscript } = await loadCatalog();
  const items = roomCatalog();
  assert.equal(groupTranscript([
    userSaid('请讨论'),
    asked('c1', 'a'),
    answered('c1', '方案A\nNEXT: all'),
    asked('c2', 'b'),
    answered('c2', '(pass)'),
  ], items), [
    '[用户]',
    '请讨论',
    '[1]',
    '方案A',
  ].join('\n'));
  assert.equal(groupTranscript([
    userSaid('请讨论'),
    asked('c1', 'a'),
    answered('c1', '方案A\nNEXT: all'),
  ], items).includes('NEXT:'), false);
});

test('isPassContent and memberVisibleText accept pass variants', async () => {
  const { isPassContent, memberVisibleText } = await loadCatalog();
  assert.equal(isPassContent(''), true);
  assert.equal(isPassContent('(pass)'), true);
  assert.equal(isPassContent(' pass '), true);
  assert.equal(isPassContent('( pass ).'), true);
  assert.equal(isPassContent('方案A'), false);
  assert.equal(memberVisibleText('方案A\nNEXT: pass'), '方案A');
  assert.equal(memberVisibleText('(pass)'), '');
  assert.equal(memberVisibleText('NEXT: pass'), '');
});

test('memberTurnOrPass converts a non-abort member failure to silent pass', async () => {
  const { memberTurnOrPass } = await loadCatalog();
  await assert.doesNotReject(async () => {
    assert.deepEqual(
      await memberTurnOrPass({ id: 'a', name: 'Agent A' }, async () => {
        throw new Error('member model failed');
      }),
      { botId: 'a', name: 'Agent A', text: '', texts: [] },
    );
  });
});

test('resolveGroupProtocolLimits hard-clamps direct callers to 10 turns and 3 rounds', async () => {
  const { resolveGroupProtocolLimits } = await loadCatalog();
  assert.deepEqual(resolveGroupProtocolLimits({ maxSpeaks: 999, maxRounds: 999 }), {
    maxSpeaks: 10,
    maxRounds: 3,
  });
  assert.deepEqual(resolveGroupProtocolLimits({ maxSpeaks: -4, maxRounds: 0 }), {
    maxSpeaks: 1,
    maxRounds: 1,
  });
});

test('orderRoundSpeakers rotates by round index', async () => {
  const { orderRoundSpeakers } = await loadCatalog();
  const members = ['a', 'b', 'c'];
  assert.deepEqual(orderRoundSpeakers(members, 0), ['a', 'b', 'c']);
  assert.deepEqual(orderRoundSpeakers(members, 1), ['b', 'c', 'a']);
  assert.deepEqual(orderRoundSpeakers(members, 2), ['c', 'a', 'b']);
});

test('nextRoomSpeakerId walks round-robin and honors @mentions', async () => {
  const { nextRoomSpeakerId } = await loadCatalog();
  const items = roomCatalog();
  const room = items[0];
  assert.equal(nextRoomSpeakerId(items, room, [userSaid('你好啊')]), 'a');
  assert.equal(nextRoomSpeakerId(items, room, [
    userSaid('你好啊'),
    asked('c1', 'a'),
    answered('c1', '嗨'),
  ]), 'b');
  assert.equal(nextRoomSpeakerId(items, room, [
    userSaid('你好啊'),
    asked('c1', 'a'),
    answered('c1', '嗨'),
    asked('c2', 'b'),
    answered('c2', '在'),
    asked('c3', 'c'),
    answered('c3', '诗'),
  ]), 'b');
  assert.equal(nextRoomSpeakerId(items, room, [userSaid('@3 只叫你')]), 'c');
});

test('nextRoomSpeakerId stops when every member passes a round', async () => {
  const { nextRoomSpeakerId } = await loadCatalog();
  const items = roomCatalog();
  const room = items[0];
  assert.equal(nextRoomSpeakerId(items, room, [
    userSaid('请讨论'),
    asked('c1', 'a'), answered('c1', '(pass)'),
    asked('c2', 'b'), answered('c2', '(pass)'),
    asked('c3', 'c'), answered('c3', '(pass)'),
  ]), undefined);
});

test('nextRoomSpeakerId ignores legacy NEXT footers for scheduling', async () => {
  const { nextRoomSpeakerId } = await loadCatalog();
  const items = roomCatalog();
  const room = items[0];
  assert.equal(nextRoomSpeakerId(items, room, [
    userSaid('请讨论'),
    asked('c1', 'a'),
    answered('c1', '先说\nNEXT: all'),
  ]), 'b');
  assert.equal(nextRoomSpeakerId(items, room, [
    userSaid('请讨论'),
    asked('c1', 'a'),
    answered('c1', '结论\nNEXT: done'),
  ]), 'b');
  assert.equal(nextRoomSpeakerId(items, room, [
    userSaid('@3 先说'),
    asked('c3', 'c'),
    answered('c3', '拉其他人\nNEXT: @1 @2'),
  ]), 'c');
});

test('nextRoomSpeakerId caps visible deliveries only and hard-clamps maxRounds', async () => {
  const { memberTurnAttempts, nextRoomSpeakerId, visibleMemberMessageCount } = await loadCatalog();
  const items = roomCatalog();
  const room = items[0];
  // Grok parity: a dangling (crash-replayed) call neither consumes the
  // maxSpeaks cap nor advances the queue — the member is re-asked.
  const danglingAttempt = [userSaid('请讨论'), asked('c1', 'a')];
  assert.deepEqual(memberTurnAttempts(danglingAttempt), [{
    botId: 'a',
    text: '',
    completed: false,
  }]);
  assert.equal(visibleMemberMessageCount(danglingAttempt, items), 0);
  assert.equal(nextRoomSpeakerId(items, room, danglingAttempt, { maxSpeaks: 1 }), 'a');
  // A completed pass attempt advances the queue without consuming the cap.
  assert.equal(visibleMemberMessageCount([
    userSaid('请讨论'),
    asked('c1', 'a'), answered('c1', '(pass)'),
  ], items), 0);
  assert.equal(nextRoomSpeakerId(items, room, [
    userSaid('请讨论'),
    asked('c1', 'a'), answered('c1', '(pass)'),
  ], { maxSpeaks: 1 }), 'b');
  // Two visible deliveries hit maxSpeaks=2.
  assert.equal(nextRoomSpeakerId(items, room, [
    userSaid('请讨论'),
    asked('c1', 'a'), answered('c1', '一'),
    asked('c2', 'b'), answered('c2', '二'),
  ], { maxSpeaks: 2 }), undefined);
  // A pass between visible deliveries is not counted.
  assert.equal(nextRoomSpeakerId(items, room, [
    userSaid('请讨论'),
    asked('c1', 'a'), answered('c1', '一'),
    asked('c2', 'b'), answered('c2', '(pass)'),
  ], { maxSpeaks: 2 }), 'c');
  // A two-message member turn consumes two of the cap.
  assert.equal(visibleMemberMessageCount([
    userSaid('请讨论'),
    asked('c1', 'a'), answeredMany('c1', ['第一', '第二']),
  ], items), 2);
  assert.equal(nextRoomSpeakerId(items, room, [
    userSaid('请讨论'),
    asked('c1', 'a'), answeredMany('c1', ['第一', '第二']),
  ], { maxSpeaks: 2 }), undefined);
  assert.equal(nextRoomSpeakerId(items, room, [
    userSaid('请讨论'),
    asked('c1', 'a'), answeredMany('c1', ['第一', '第二']),
  ], { maxSpeaks: 3 }), 'b');
  assert.equal(nextRoomSpeakerId(items, room, [
    userSaid('请讨论'),
    asked('c1', 'a'), answered('c1', '一'),
    asked('c2', 'b'), answered('c2', '二'),
    asked('c3', 'c'), answered('c3', '三'),
  ], { maxRounds: 1 }), undefined);
  assert.deepEqual(memberTurnAttempts([
    userSaid('请讨论'),
    asked('c1', 'a'), answered('c1', '(pass)'),
  ]), [{ botId: 'a', text: '(pass)', completed: true }]);
});

test('isRoomConversationRequest skips 1:1 bots and auxiliary purposes', async () => {
  const { isRoomConversationRequest } = await loadCatalog();
  const items = roomCatalog();
  assert.equal(isRoomConversationRequest({ sessionId: 's-room' }, items), true);
  assert.equal(isRoomConversationRequest({ sessionId: 's-a' }, items), false);
  assert.equal(isRoomConversationRequest({ sessionId: 's-room', purpose: 'compaction' }, items), false);
  assert.equal(isRoomConversationRequest({ sessionId: 's-room', purpose: 'session-title' }, items), false);
});

test('roomDispatchChunks emits one ask_participant then empty stop', async () => {
  const { roomDispatchChunks } = await loadCatalog();
  const items = roomCatalog();
  const first = roomDispatchChunks({
    items,
    sessionId: 's-room',
    events: [userSaid('你好啊')],
    callId: 'call-1',
  });
  const firstCall = first.find((chunk) => chunk.type === 'block-end');
  assert.equal(firstCall.block.name, 'ask_participant');
  assert.equal(JSON.parse(firstCall.block.arguments).botId, 'a');
  assert.match(JSON.parse(firstCall.block.arguments).instruction, /It's your turn/);
  assert.match(JSON.parse(firstCall.block.arguments).instruction, /你好啊/);
  assert.equal(first.filter((chunk) => chunk.type === 'block-end').length, 1);
  assert.equal(first.at(-1).reason.kind, 'tool-calls');

  const second = roomDispatchChunks({
    items,
    sessionId: 's-room',
    events: [userSaid('你好啊'), asked('c1', 'a'), answered('c1', '嗨')],
    callId: 'call-2',
  });
  const secondArgs = JSON.parse(second.find((chunk) => chunk.type === 'block-end').block.arguments);
  assert.equal(secondArgs.botId, 'b');
  assert.notEqual(secondArgs.instruction, '你好啊');
  assert.match(secondArgs.instruction, /It's your turn/);
  assert.match(secondArgs.instruction, /\(pass\)/);
  assert.doesNotMatch(secondArgs.instruction, /Earlier members already answered/);

  const done = roomDispatchChunks({
    items,
    sessionId: 's-room',
    events: [
      userSaid('你好啊'),
      asked('c1', 'a'), answered('c1', '嗨'),
      asked('c2', 'b'), answered('c2', '在'),
      asked('c3', 'c'), answered('c3', '诗'),
    ],
    callId: 'call-3',
    maxRounds: 1,
  });
  assert.deepEqual(done, [{ type: 'finish', reason: { kind: 'stop' } }]);
  assert.equal(done.some((chunk) => chunk.type === 'text-delta'), false);

  const mentioned = roomDispatchChunks({
    items,
    sessionId: 's-room',
    events: [userSaid('@3 只叫你')],
    callId: 'call-4',
  });
  assert.equal(JSON.parse(mentioned.find((chunk) => chunk.type === 'block-end').block.arguments).botId, 'c');
});

test('sessionCreatePayload stamps origin and prefers workspace over scratch cwd', async () => {
  const { sessionCreatePayload } = await loadCatalog();
  assert.deepEqual(sessionCreatePayload(), { origin: 'dshbot' });
  assert.deepEqual(sessionCreatePayload({ scratchCwd: '/scratch' }), {
    origin: 'dshbot',
    cwd: '/scratch',
  });
  assert.deepEqual(sessionCreatePayload({
    workspaceId: 'w1',
    scratchCwd: '/scratch',
    agentPreset: 'dshbot-room',
  }), {
    origin: 'dshbot',
    agentPreset: 'dshbot-room',
    workspaceId: 'w1',
  });
});

test('client registers the bots tab, overlay, and ask_participant toolview', () => {
  const src = require('fs').readFileSync(
    path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'client', 'client.js'),
    'utf8',
  );
  assert.match(src, /sidebar\.nav\.tab/);
  assert.match(src, /TAB_ID = "bots"/);
  assert.match(src, /shell\.overlay/);
  assert.match(src, /ask_participant/);
  assert.match(src, /persistDefault: false/);
  assert.match(src, /applyCatalogModel/);
  assert.match(src, /scratchCwd/);
  assert.match(src, /group\.id/);
  assert.match(src, /createContactSession/);
  assert.match(src, /item\.id === botId/);
  assert.match(src, /AvatarView/);
  assert.match(src, /avatarBlob: "机器人"/);
  assert.equal(src.includes('avatarBlob: "小人"'), false);
  assert.match(src, /dshbot-modal/);
  assert.match(src, /dshbot-blob-eye-pupil/);
  assert.match(src, /--dshbot-blob-ink/);
  assert.equal(/:root\s*\{[^}]*--dshbot-blob-ink/.test(src), false);
  assert.equal(src.includes('transition: d'), false);
  assert.match(src, /requestAnimationFrame/);
  assert.match(src, /dshbot-blob-blink/);
  assert.match(src, /scale\(1\.12\)/);
  assert.equal(src.includes('scale(1.06)'), false);
  assert.match(src, /memberAvatar/);
  assert.match(src, /thinking: "思考中"/);
  assert.match(src, /roomBadge: "群"/);
  assert.match(src, /dshbot-badge/);
  assert.match(src, /inputTriggers/);
  assert.match(src, /trigger: "@"/);
  assert.match(src, /noteAgentPreset/);
  assert.match(src, /stampRoomPresets/);
  assert.equal(src.includes('session?.title'), false);
  assert.match(src, /item\.model\?\.model/);
  assert.match(src, /memberVisibleText/);
  assert.match(src, /NEXT:/);
  assert.match(src, /dshbot-activity-dot/);
  assert.equal(src.includes('thinking: Boolean(session?.running)'), false);
  assert.match(src, /GROUP_MAX_MEMBERS/);
  assert.match(src, /togglePin/);
  assert.match(src, /toggleHide/);
  assert.match(src, /dshbot-bubble-omit/);
  assert.match(src, /dshbot-room/);
  assert.match(src, /conversation\.chat\.empty/);
  assert.match(src, /emptyRoster/);
  assert.match(src, /dshbot-roster/);
  assert.equal(src.includes('resultText || instruction'), false);
  assert.match(src, /kind === "tool-result"/);
  // One bubble text per delivery; the old joined-text extractor is gone.
  assert.match(src, /textsFromContent\(block\.content\)/);
  assert.match(src, /visibleTexts\.map\(/);
  assert.equal(src.includes('function textFromContent'), false);
  assert.equal(src.includes('block?.result ?? block?.output'), false);
  assert.equal(src.includes('AvatarEditor'), false);
  assert.match(src, /name: "everyone"/);
  assert.match(src, /text: `@\$\{candidate\.name\} `/);
  assert.match(src, /personaOppose: "反对"/);
  assert.match(src, /personaFill: "补全"/);
  assert.match(src, /personaShip: "落地"/);
  assert.match(src, /personaSharp: "毒舌"/);
  assert.match(src, /专找漏洞和未说明的前提/);
  assert.match(src, /只补被漏掉的约束/);
  assert.match(src, /只谈能不能做/);
  assert.match(src, /话短、带刺、不迎合/);
  assert.match(src, /PERSONA_TEMPLATES/);
  assert.match(src, /setDescription\(chip\.text\)/);
  assert.match(src, /GROUP_MIN_MEMBERS = 2/);
  assert.match(src, /memberIds\.length < GROUP_MIN_MEMBERS/);
  assert.match(src, /items\.filter\(\(item\) => item\.kind !== "room"\)\.length < GROUP_MIN_MEMBERS/);
  assert.match(src, /item\.kind === "room" \|\| session\?\.blank === false/);
  assert.equal(src.includes('notifications'), false);
  assert.equal(src.includes('memoryLabel'), false);
  assert.equal(src.includes('memoryHint'), false);
});

test('profile host apply short-circuits room llm/stream and registers ask_participant', () => {
  const src = require('fs').readFileSync(
    path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'lib', 'index.js'),
    'utf8',
  );
  assert.match(src, /export const name = 'dsh-bot'/);
  assert.match(src, /registerAskParticipant/);
  assert.match(src, /registerSendToAgent/);
  assert.match(src, /registerInboxDrain/);
  assert.match(src, /remember/);
  assert.match(src, /composePersonaWithMemory/);
  assert.match(src, /'tools'/);
  assert.equal(src.includes('.optional('), false);
  assert.match(src, /registerContinuableSetup/);
  assert.match(src, /dshbot:member/);
  assert.match(src, /AvatarSchema/);
  assert.match(src, /'llm'/);
  assert.match(src, /'llm\/stream'/);
  assert.match(src, /isRoomConversationRequest/);
  assert.match(src, /roomDispatchChunks/);
  assert.match(src, /nextTurnEpoch/);
  assert.match(src, /abortRoomMemberTurns/);
  assert.match(src, /export const Config/);
  assert.equal(src.includes('memberChildren'), false);
  assert.equal(src.includes('childPersonaForSession'), false);
  assert.match(src, /maxSpeaks/);
  assert.match(src, /maxRounds/);
  assert.match(src, /max\(GROUP_MAX_MEMBER_TURNS\)/);
  assert.match(src, /max\(GROUP_MAX_ROUNDS\)/);
  assert.match(src, /resolveGroupProtocolLimits\(config\)/);
  assert.equal(src.includes('notifications:'), false);
  assert.match(src, /apply\(ctx, config/);
  assert.equal(src.includes('ctx.config'), false);
  assert.match(src, /const downstream = next\(\)/);
  assert.match(src, /ackPendingInboxDrain/);
});

test('room preset tool registers ask_participant as a one-shot child', () => {
  const src = require('fs').readFileSync(
    path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'lib', 'ask-participant.js'),
    'utf8',
  );
  assert.match(src, /name: 'ask_participant'/);
  assert.match(src, /subagents\.start\(SPAWN_PROVIDER/);
  assert.match(src, /run\.result/);
  assert.match(src, /run\.dispose/);
  assert.equal(src.includes('startContinuable'), false);
  assert.equal(src.includes('followup'), false);
  assert.match(src, /memberDisplayName/);
  assert.match(src, /childPersonaText/);
  assert.match(src, /memberPersona/);
  assert.match(src, /roomTurnPromptForSpeaker/);
  assert.match(src, /memberTurnOrPass/);
  assert.match(src, /abortRoomMemberTurns/);
  assert.equal(src.includes('speakerSeat'), false);
  assert.equal(src.includes('roomSpeakInstruction'), false);
  assert.equal(src.includes('whenIdle()'), false);
  assert.match(src, /export function registerAskParticipant/);
  assert.match(src, /send_room_message/);
  assert.match(src, /extractSendRoomDeliveries/);
  assert.match(src, /GROUP_MAX_MESSAGES_PER_TURN/);
  // Deliveries stay separate: array output + one rendered block per message.
  assert.match(src, /texts: deliveries/);
  assert.match(src, /texts: \{ type: 'array', items: \{ type: 'string' \}, required: true \}/);
  assert.match(src, /texts\.map\(\(text\) => \(\{ type: 'text', text: String\(text \?\? ''\) \}\)\)/);
  assert.match(src, /isPassContent/);
  assert.match(src, /allow: \['send_room_message'\]/);
  assert.match(src, /restrict\(\{ allow: \['ask_participant'\] \}\)/);
  assert.equal(src.includes('throw err'), false);
  assert.equal(/export function apply[\s\S]*tools\.register/.test(src), false);
  assert.match(src, /content: \[\]/);
  assert.equal(src.includes("kind: 'coordinator'"), false);
  assert.doesNotMatch(src, /allow: \[\]/);
});

test('send_to_agent omits required:false so defineTool accepts optional priority', () => {
  const src = require('fs').readFileSync(
    path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'lib', 'send-to-agent.js'),
    'utf8',
  );
  assert.match(src, /name: 'send_to_agent'/);
  assert.match(src, /priority:\s*\{/);
  assert.equal(/required:\s*false/.test(src), false);
});

test('room preset mounts ask_participant without a dispatcher persona', () => {
  const yml = require('fs').readFileSync(
    path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'presets', 'dshbot-room', 'agent.cordis.yml'),
    'utf8',
  );
  assert.match(yml, /dshbot\/ask-participant/);
  const ids = [...yml.matchAll(/^- id: (\S+)/gm)].map((match) => match[1]);
  assert.deepEqual(ids, ['persona', 'ask-participant']);
  assert.equal(/verbatim/.test(yml), false);
  assert.equal(/every member who should speak/.test(yml), false);
  assert.equal(/lists no botId/.test(yml), false);
  assert.equal(/function-calling/.test(yml), false);
});

test('room preset metadata is not a session-picker group name', () => {
  const yml = require('fs').readFileSync(
    path.join(__dirname, '..', '..', 'vendor', 'dshbot', 'presets', 'dshbot-room', 'preset.yml'),
    'utf8',
  );
  assert.equal(yml.includes('群聊'), false);
  assert.match(yml, /dshbot-room/);
});
