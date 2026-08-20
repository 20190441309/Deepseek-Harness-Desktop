/**
 * Pure catalog helpers for dshbot contacts and rooms.
 * Host apply, the room tool, and node:test share this module.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export const AVATAR_HUE_COUNT = 6;

/** Spawn-time overlay so the child complete prompt can see the member persona. */
export const memberPersona = new AsyncLocalStorage();

/**
 * @param {string | undefined} name
 * @returns {string}
 */
export function avatarInitial(name) {
  const trimmed = String(name ?? '').trim();
  return trimmed ? [...trimmed][0] : '?';
}

/**
 * @param {string | undefined} name
 * @returns {number}
 */
export function avatarHue(name) {
  const text = String(name ?? '');
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  }
  return hash % AVATAR_HUE_COUNT;
}

/**
 * @param {readonly object[]} items
 * @param {string | undefined} query
 * @returns {object[]}
 */
export function filterItems(items, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((item) => {
    const hay = [item.name, item.title, item.description]
      .filter(Boolean)
      .join('\n')
      .toLowerCase();
    return hay.includes(needle);
  });
}

/**
 * @param {{ blank?: boolean } | undefined} session
 * @returns {boolean}
 */
export function canChangeWorkspace(session) {
  return session?.blank === true;
}

/**
 * @param {readonly object[]} items
 * @param {object} item
 * @returns {object[]}
 */
export function upsertItem(items, item) {
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index < 0) return [...items, item];
  const next = [...items];
  next[index] = item;
  return next;
}

/**
 * @param {readonly object[]} items
 * @param {string} id
 * @param {number} updatedAt
 * @returns {object[]}
 */
export function touchItem(items, id, updatedAt) {
  return items.map((item) => (item.id === id ? { ...item, updatedAt } : item));
}

/**
 * @param {readonly object[]} items
 * @param {string} id
 * @returns {object[]}
 */
export function removeItem(items, id) {
  return items.filter((item) => item.id !== id);
}

/**
 * Contacts shown in an empty dshbot transcript: the 1:1 bot, or a room's
 * known members. Missing catalog rows and unknown session ids yield null.
 * @param {readonly object[]} items
 * @param {string | undefined} sessionId
 * @returns {object[] | null}
 */
export function emptyRoster(items, sessionId) {
  if (!sessionId) return null;
  const item = items.find((entry) => entry.sessionId === sessionId);
  if (!item) return null;
  if (item.kind === 'room') {
    const members = [];
    for (const botId of item.memberBotIds ?? []) {
      const member = items.find((entry) => entry.id === botId);
      if (member) members.push(member);
    }
    return members;
  }
  return [item];
}

/**
 * @param {readonly object[]} items
 * @param {string | undefined} sessionId
 * @returns {string}
 */
export function personaText(items, sessionId) {
  if (!sessionId) return '';
  const item = items.find((entry) => entry.sessionId === sessionId);
  if (!item || item.kind === 'room') return '';
  return typeof item.description === 'string' ? item.description : '';
}

/**
 * Display name for a catalog member id or a unique member name.
 * @param {readonly object[]} items
 * @param {string | undefined} botId
 * @returns {string}
 */
export function memberDisplayName(items, botId) {
  const id = String(botId ?? '');
  if (!id) return 'Bot';
  const byId = items.find((entry) => entry.id === id && entry.kind !== 'room');
  if (typeof byId?.name === 'string' && byId.name) return byId.name;
  const named = items.filter((entry) => entry.kind !== 'room' && entry.name === id);
  if (named.length === 1 && typeof named[0].name === 'string') return named[0].name;
  return id;
}

/**
 * Complete-prompt persona for a spawned room member.
 * @param {object | undefined} bot
 * @param {readonly object[]} [others]
 * @param {{ seat?: 'first' | 'later' }} [options]
 * @returns {string}
 */
export function childPersonaText(bot, others = [], options = {}) {
  const seat = options.seat === 'later' ? 'later' : 'first';
  const name = String(bot?.name ?? '').trim() || 'Bot';
  const description = typeof bot?.description === 'string' ? bot.description.trim() : '';
  const otherNames = others
    .map((entry) => String(entry?.name ?? '').trim())
    .filter(Boolean);
  const groupLine = otherNames.length
    ? `You are in a group chat with the user and ${otherNames.join(', ')}.`
    : 'You are in a group chat with the user and other members.';
  const emptyLater = seat === 'later' && !description
    ? 'You have no distinct expertise beyond what is already in the log. You should pass.'
    : '';
  const seatLines = seat === 'later'
    ? [
      'Earlier members already answered. Your default action is to add nothing.',
      'If you have nothing distinct to add, your entire reply must be only the line NEXT: pass.',
      'Speak only if your persona gives a correction, disagreement, or one new point that is not already in the log.',
      'If you speak: one or two sentences, no greeting, no name prefix, no restating the previous plan.',
      'Do not use NEXT: all.',
    ]
    : [
      'Reply with only the message body. Never greet the room, never introduce yourself, and never start with 大家好 or Hello.',
      'Never prefix the reply with your name or a Name: label. The UI already shows who you are.',
      'Do not wait for a dispatcher, do not report what others said unless you heard them, and do not summarize the room unless you are giving the combined conclusion.',
    ];
  const lines = [
    `You are ${name}.`,
    description,
    emptyLater,
    groupLine,
    'The messages you receive are the group log so far, labeled [speaker] then the body, followed by a turn instruction. Reply as yourself, in the first person.',
    ...seatLines,
    'Stay in character for every reply. You are this member, not a generic assistant.',
    'Do not mention DeepSeek Harness, being an AI agent, tools, or a dispatcher.',
    'End every reply with a last line of exactly one of: NEXT: pass, NEXT: done, NEXT: all, or NEXT: @Name @Name.',
    'Use NEXT: done when the group has a combined conclusion. Use NEXT: pass when you have nothing to add.',
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * Persona for a continuable child session recorded on a room row.
 * @param {readonly object[]} items
 * @param {string | undefined} sessionId
 * @returns {string}
 */
export function childPersonaForSession(items, sessionId) {
  if (!sessionId) return '';
  for (const item of items) {
    if (item.kind !== 'room') continue;
    const children = Array.isArray(item.memberChildren) ? item.memberChildren : [];
    const row = children.find((entry) => entry.sessionId === sessionId);
    if (!row) continue;
    const bot = items.find((entry) => entry.id === row.botId && entry.kind !== 'room');
    if (!bot) continue;
    const others = (item.memberBotIds ?? [])
      .filter((id) => id !== row.botId)
      .map((id) => items.find((entry) => entry.id === id && entry.kind !== 'room'))
      .filter(Boolean);
    return childPersonaText(bot, others);
  }
  return '';
}

/**
 * @param {readonly object[]} items
 * @param {readonly string[]} members
 * @param {string} botId
 * @returns {string}
 */
function resolveMemberBotId(items, members, botId) {
  if (members.includes(botId)) return botId;
  const named = items.filter((entry) => (
    entry.kind !== 'room' && entry.name === botId && members.includes(entry.id)
  ));
  return named.length === 1 ? named[0].id : botId;
}

/**
 * @param {readonly object[]} items
 * @param {string} parentSessionId
 * @param {string} botId
 */
export function resolveAskTarget(items, parentSessionId, botId) {
  const room = items.find((entry) => entry.sessionId === parentSessionId);
  if (!room || room.kind !== 'room') {
    throw new Error('ask_participant: calling session is not a room');
  }
  const members = Array.isArray(room.memberBotIds) ? room.memberBotIds : [];
  const resolvedId = resolveMemberBotId(items, members, botId);
  if (!members.includes(resolvedId)) {
    throw new Error(`ask_participant: bot ${botId} is not a member of this room`);
  }
  const bot = items.find((entry) => entry.id === resolvedId);
  if (!bot || bot.kind === 'room') {
    throw new Error(`ask_participant: unknown bot ${botId}`);
  }
  const children = Array.isArray(room.memberChildren) ? room.memberChildren : [];
  const child = children.find((entry) => entry.botId === resolvedId);
  return {
    room,
    bot,
    childSessionId: child?.sessionId,
  };
}

/**
 * @param {readonly object[]} items
 * @param {string} roomSessionId
 * @param {string} botId
 * @param {string} childSessionId
 * @returns {object[]}
 */
export function rememberChild(items, roomSessionId, botId, childSessionId) {
  return items.map((item) => {
    if (item.sessionId !== roomSessionId || item.kind !== 'room') return item;
    const children = Array.isArray(item.memberChildren) ? [...item.memberChildren] : [];
    const index = children.findIndex((entry) => entry.botId === botId);
    const row = { botId, sessionId: childSessionId };
    if (index < 0) children.push(row);
    else children[index] = row;
    return { ...item, memberChildren: children };
  });
}

/**
 * @param {readonly { role?: string, content?: readonly { type?: string, text?: string }[] }[]} messages
 * @param {string} role
 * @returns {string}
 */
function lastRoleText(messages, role) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== role) continue;
    const text = (message.content ?? [])
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');
    if (text) return text;
  }
  return '';
}

/**
 * @param {readonly { role?: string, content?: readonly { type?: string, text?: string }[] }[]} messages
 * @returns {string}
 */
export function lastAssistantText(messages) {
  return lastRoleText(messages, 'assistant');
}

/**
 * @param {readonly { role?: string, content?: readonly { type?: string, text?: string }[] }[]} messages
 * @returns {string}
 */
export function lastUserText(messages) {
  return lastRoleText(messages, 'user');
}

/** Hard cap on ask_participant calls after one user message. */
export const DEFAULT_MAX_SPEAKS = 12;

/** Hard cap on completed speaker rounds after one user message. */
export const DEFAULT_MAX_ROUNDS = 4;

/**
 * Parse a member reply's last-line NEXT: footer. The footer stays in the
 * session log; UI and groupTranscript use `visible`.
 * @param {string | undefined} text
 * @returns {{ kind: 'pass' | 'done' | 'all' | 'mention', names: string[], visible: string }}
 */
export function parseRoomNext(text) {
  const raw = String(text ?? '').replace(/[ \t]+$/gm, '').replace(/\s+$/u, '');
  const lines = raw.split('\n');
  const last = lines[lines.length - 1] ?? '';
  const match = last.match(/^NEXT:\s*(.*)$/i);
  if (!match) {
    return { kind: 'pass', names: [], visible: raw };
  }
  const visible = lines.slice(0, -1).join('\n').replace(/\s+$/u, '');
  const body = match[1].trim();
  const lower = body.toLowerCase();
  if (lower === 'pass' || body === '') {
    return { kind: 'pass', names: [], visible };
  }
  if (lower === 'done') {
    return { kind: 'done', names: [], visible };
  }
  if (lower === 'all') {
    return { kind: 'all', names: [], visible };
  }
  const names = [];
  const re = /@([^\s@]+)/g;
  let hit = re.exec(body);
  while (hit) {
    names.push(hit[1]);
    hit = re.exec(body);
  }
  if (names.length === 0) {
    return { kind: 'pass', names: [], visible };
  }
  return { kind: 'mention', names, visible };
}

/**
 * Strip the NEXT: control line from a member reply.
 * @param {string | undefined} text
 * @returns {string}
 */
export function stripRoomNext(text) {
  return parseRoomNext(text).visible;
}

/**
 * Members the user addressed with @name. Empty means the whole room.
 * @param {readonly object[]} items
 * @param {readonly string[]} memberIds
 * @param {string | undefined} userText
 * @returns {string[]}
 */
export function mentionedBotIds(items, memberIds, userText) {
  const text = String(userText ?? '');
  const hits = [];
  for (const id of memberIds) {
    const bot = items.find((entry) => entry.id === id && entry.kind !== 'room');
    if (!bot) continue;
    const name = String(bot.name ?? '').trim();
    if (!name) continue;
    if (text.includes(`@${name}`) || text.includes(`@${id}`)) hits.push(id);
  }
  return hits;
}

/**
 * Who should speak this turn: @mentions, otherwise every member.
 * @param {readonly object[]} items
 * @param {readonly string[]} memberIds
 * @param {string | undefined} userText
 * @returns {string[]}
 */
export function roomSpeakerIds(items, memberIds, userText) {
  const mentioned = mentionedBotIds(items, memberIds, userText);
  return mentioned.length ? mentioned : [...memberIds];
}

/**
 * @param {unknown} content
 * @returns {string}
 */
function contentText(content) {
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
      continue;
    }
    if (block?.type === 'tool-result' && Array.isArray(block.content)) {
      const nested = contentText(block.content);
      if (nested) parts.push(nested);
    }
  }
  return parts.join('');
}

/**
 * Catalog room bound to this session, if any.
 * @param {readonly object[]} items
 * @param {string | undefined} sessionId
 * @returns {object | undefined}
 */
export function catalogRoom(items, sessionId) {
  if (!sessionId) return undefined;
  return items.find((entry) => entry.sessionId === sessionId && entry.kind === 'room');
}

/**
 * Ordinary room conversation requests skip the chat model. Title/compaction
 * calls and 1:1 bot sessions still go downstream.
 * @param {{ purpose?: string, sessionId?: string } | undefined} options
 * @param {readonly object[]} items
 * @returns {boolean}
 */
export function isRoomConversationRequest(options, items) {
  if (!options || options.purpose) return false;
  return catalogRoom(items, options.sessionId) !== undefined;
}

/**
 * @param {readonly object[] | undefined} events
 * @returns {string}
 */
export function lastUserTextFromEvents(events) {
  const list = events ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const event = list[i];
    if (event?.type !== 'user/message' || event.data?.source?.kind !== 'user') continue;
    const text = contentText(event.data.content);
    if (text) return text;
  }
  return '';
}

/**
 * Last non-empty assistant/message in a session log.
 * @param {readonly object[] | undefined} events
 * @returns {string}
 */
export function lastAssistantTextFromEvents(events) {
  const list = events ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const event = list[i];
    if (event?.type !== 'assistant/message') continue;
    const text = contentText(event.data?.content);
    if (text) return text;
  }
  return '';
}

/**
 * Seq of the last non-empty assistant/message, or -1 when the child has not
 * spoken yet. Room execute waits for a seq greater than this after followup.
 * @param {readonly object[] | undefined} events
 * @returns {number}
 */
export function lastAssistantSeqFromEvents(events) {
  const list = events ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const event = list[i];
    if (event?.type !== 'assistant/message') continue;
    const text = contentText(event.data?.content);
    if (!text) continue;
    return typeof event.seq === 'number' ? event.seq : i;
  }
  return -1;
}

/**
 * ask_participant botIds already recorded after the latest user message.
 * @param {readonly object[] | undefined} events
 * @returns {string[]}
 */
export function spokenBotIdsSinceLastUser(events) {
  const list = events ?? [];
  let start = 0;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const event = list[i];
    if (event?.type === 'user/message' && event.data?.source?.kind === 'user') {
      start = i + 1;
      break;
    }
  }
  const ids = [];
  for (let i = start; i < list.length; i += 1) {
    const event = list[i];
    if (event?.type !== 'tool/call' || event.data?.name !== 'ask_participant') continue;
    try {
      const args = JSON.parse(event.data.arguments ?? '{}');
      if (typeof args.botId === 'string' && args.botId) ids.push(args.botId);
    } catch {
      // Invalid tool-call JSON is not a spoken member.
    }
  }
  return ids;
}

/**
 * @param {readonly object[] | undefined} events
 * @returns {number}
 */
function lastUserMessageIndex(events) {
  const list = events ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const event = list[i];
    if (event?.type !== 'user/message' || event.data?.source?.kind !== 'user') continue;
    if (contentText(event.data.content)) return i;
  }
  return -1;
}

/**
 * @param {object} event
 * @returns {string}
 */
function askParticipantBotId(event) {
  const raw = event.data?.arguments;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.botId === 'string') {
    return raw.botId;
  }
  try {
    const args = JSON.parse(typeof raw === 'string' ? raw : '{}');
    return typeof args.botId === 'string' ? args.botId : '';
  } catch {
    return '';
  }
}

/**
 * Completed ask_participant turns after the latest user message.
 * @param {readonly object[] | undefined} events
 * @returns {{ botId: string, text: string }[]}
 */
function completedMemberTurns(events) {
  const list = events ?? [];
  const start = lastUserMessageIndex(list);
  if (start < 0) return [];
  const botByCall = new Map();
  const turns = [];
  for (let i = start + 1; i < list.length; i += 1) {
    const event = list[i];
    if (event?.type === 'tool/call' && event.data?.name === 'ask_participant') {
      const botId = askParticipantBotId(event);
      const callId = event.data.callId;
      if (botId && callId) botByCall.set(callId, botId);
      continue;
    }
    if (event?.type !== 'tool/result') continue;
    const callId = event.data?.message?.source?.callId;
    const botId = botByCall.get(callId);
    if (!botId) continue;
    turns.push({ botId, text: contentText(event.data.message?.content) });
  }
  return turns;
}

/**
 * Whether this member is the first to reply after the latest user message.
 * @param {readonly object[] | undefined} events
 * @returns {'first' | 'later'}
 */
export function speakerSeat(events) {
  return completedMemberTurns(events).length === 0 ? 'first' : 'later';
}

/**
 * Visible member bodies already on disk this user turn, labeled like the group log.
 * @param {readonly object[] | undefined} events
 * @param {readonly object[]} items
 * @returns {string}
 */
export function priorVisibleThisTurn(events, items) {
  const lines = [];
  for (const turn of completedMemberTurns(events)) {
    const visible = stripRoomNext(turn.text);
    if (!visible) continue;
    lines.push(`[${memberDisplayName(items, turn.botId)}]`, visible);
  }
  return lines.join('\n');
}

/**
 * User-facing instruction for one room seat. Later seats default to NEXT: pass.
 * @param {{ seat?: 'first' | 'later', userText?: string, priorVisible?: string }} opts
 * @returns {string}
 */
export function speakInstruction(opts = {}) {
  const seat = opts.seat === 'later' ? 'later' : 'first';
  const said = String(opts.userText ?? '');
  if (seat === 'later') {
    const prior = String(opts.priorVisible ?? '').trim();
    const priorBlock = prior
      ? `What has already been said this turn:\n${prior}`
      : 'What has already been said this turn:\n(none)';
    return [
      'Earlier members already answered this turn. Speak only if your persona gives a correction, disagreement, or one new point that is not already in the log. Otherwise your entire reply must be only:',
      'NEXT: pass',
      '',
      'The user said:',
      said,
      '',
      priorBlock,
    ].join('\n');
  }
  return [
    'You are the first member to reply this turn. Answer the user as yourself.',
    '',
    'The user said:',
    said,
  ].join('\n');
}

/**
 * Seat instruction reconstructed from the parent session log.
 * @param {readonly object[] | undefined} events
 * @param {readonly object[]} items
 * @returns {string}
 */
export function roomSpeakInstruction(events, items) {
  return speakInstruction({
    seat: speakerSeat(events),
    userText: lastUserTextFromEvents(events),
    priorVisible: priorVisibleThisTurn(events, items),
  });
}

/**
 * @param {'pass' | 'done' | 'all' | 'mention'} kind
 * @param {readonly string[]} names
 * @param {readonly object[]} items
 * @param {readonly string[]} memberIds
 * @returns {string[]}
 */
function refillQueue(kind, names, items, memberIds) {
  if (kind === 'all') return [...memberIds];
  if (kind !== 'mention') return [];
  const next = [];
  const seen = new Set();
  for (const name of names) {
    const id = resolveMemberBotId(items, memberIds, name);
    if (!memberIds.includes(id) || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

/**
 * Next catalog member who should speak, or undefined when the queue is empty.
 * Replay is a pure function of the session log: first-pass speakers, then
 * each completed reply's NEXT: footer once that round's queue is empty.
 * @param {readonly object[]} items
 * @param {object} room
 * @param {readonly object[] | undefined} events
 * @param {{ maxSpeaks?: number, maxRounds?: number }} [limits]
 * @returns {string | undefined}
 */
export function nextRoomSpeakerId(items, room, events, limits = {}) {
  const userText = lastUserTextFromEvents(events);
  if (!userText) return undefined;
  const maxSpeaks = Number.isFinite(limits.maxSpeaks) ? limits.maxSpeaks : DEFAULT_MAX_SPEAKS;
  const maxRounds = Number.isFinite(limits.maxRounds) ? limits.maxRounds : DEFAULT_MAX_ROUNDS;
  const memberIds = room.memberBotIds ?? [];
  const turns = completedMemberTurns(events);
  if (turns.length >= maxSpeaks) return undefined;
  if (turns.some((turn) => parseRoomNext(turn.text).kind === 'done')) return undefined;
  let queue = [...roomSpeakerIds(items, memberIds, userText)];
  let roundsFinished = 0;
  let lastKind = 'pass';
  let lastNames = [];
  for (const turn of turns) {
    const at = queue.indexOf(turn.botId);
    if (at >= 0) queue.splice(at, 1);
    const parsed = parseRoomNext(turn.text);
    lastKind = parsed.kind;
    lastNames = parsed.names;
    if (queue.length > 0) continue;
    roundsFinished += 1;
    if (roundsFinished >= maxRounds) return undefined;
    queue = refillQueue(parsed.kind, parsed.names, items, memberIds);
  }
  if (queue.length > 0) return queue[0];
  if (roundsFinished >= maxRounds) return undefined;
  queue = refillQueue(lastKind, lastNames, items, memberIds);
  return queue[0];
}

/**
 * Named group log the current speaker should see, including earlier members
 * this round.
 * @param {readonly object[] | undefined} events
 * @param {readonly object[]} items
 * @returns {string}
 */
export function groupTranscript(events, items) {
  const lines = [];
  const namesByCall = new Map();
  for (const event of events ?? []) {
    if (event?.type === 'user/message') {
      if (event.data?.source?.kind !== 'user') continue;
      const text = contentText(event.data.content);
      if (text) lines.push(`[用户]`, text);
      continue;
    }
    if (event?.type === 'tool/call') {
      if (event.data?.name !== 'ask_participant') continue;
      let botId = '';
      try {
        const args = JSON.parse(event.data.arguments ?? '{}');
        botId = typeof args.botId === 'string' ? args.botId : '';
      } catch {
        botId = '';
      }
      namesByCall.set(event.data.callId, memberDisplayName(items, botId));
      continue;
    }
    if (event?.type === 'tool/result') {
      const callId = event.data?.message?.source?.callId;
      const name = namesByCall.get(callId);
      if (!name) continue;
      const text = stripRoomNext(contentText(event.data.message?.content));
      if (text) lines.push(`[${name}]`, text);
    }
  }
  return lines.join('\n');
}

/**
 * @param {string} botId
 * @param {string} instruction
 * @param {string} callId
 * @returns {object[]}
 */
export function askParticipantStreamChunks(botId, instruction, callId) {
  const argumentsJson = JSON.stringify({ botId, instruction });
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: callId, name: 'ask_participant', argumentsDelta: argumentsJson },
    {
      type: 'block-end',
      index: 0,
      block: { type: 'tool-call', id: callId, name: 'ask_participant', arguments: argumentsJson },
    },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ];
}

/**
 * @returns {object[]}
 */
export function emptyStopChunks() {
  return [{ type: 'finish', reason: { kind: 'stop' } }];
}

/**
 * One sequential ask_participant call, or an empty stop after the last speaker.
 * @param {{ items: readonly object[], sessionId?: string, events?: readonly object[], callId: string, maxSpeaks?: number, maxRounds?: number }} opts
 * @returns {object[] | null}
 */
export function roomDispatchChunks(opts) {
  const room = catalogRoom(opts.items, opts.sessionId);
  if (!room) return null;
  const speaker = nextRoomSpeakerId(opts.items, room, opts.events, {
    maxSpeaks: opts.maxSpeaks,
    maxRounds: opts.maxRounds,
  });
  if (!speaker) return emptyStopChunks();
  return askParticipantStreamChunks(
    speaker,
    roomSpeakInstruction(opts.events, opts.items),
    opts.callId,
  );
}

/**
 * @returns {string}
 */
export function newCatalogId() {
  return globalThis.crypto?.randomUUID?.() ?? `dshbot-${Date.now().toString(36)}`;
}

/**
 * Payload for `sessions.create` of a 1:1 bot or room parent.
 * A workspace id attaches the session; otherwise scratchCwd matches
 * connectNoDirectory without reusing an existing blank task session.
 * @param {{ workspaceId?: string, agentPreset?: string, scratchCwd?: string }} opts
 */
export function sessionCreatePayload(opts = {}) {
  return {
    origin: 'dshbot',
    ...(opts.agentPreset ? { agentPreset: opts.agentPreset } : {}),
    ...(opts.workspaceId
      ? { workspaceId: opts.workspaceId }
      : (opts.scratchCwd ? { cwd: opts.scratchCwd } : {})),
  };
}
