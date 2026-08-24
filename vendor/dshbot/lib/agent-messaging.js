/**
 * Pure A2A inbox helpers (Grok SendToAgent / agent-messaging semantics).
 */

export const AGENT_MESSAGE_MAX_TEXT = 8_000;
export const AGENT_INBOUND_WAKE_CUE = '[agent]';
export const SAND_SEND_TO_AGENT_TOOL_NAME = 'send_to_agent';

/**
 * @param {string | undefined} text
 * @returns {string}
 */
export function clampAgentMessage(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return '';
  return trimmed.length <= AGENT_MESSAGE_MAX_TEXT
    ? trimmed
    : trimmed.slice(0, AGENT_MESSAGE_MAX_TEXT);
}

/**
 * @typedef {{ fromId: string, fromName: string, text: string, timestampMs: number, priority?: boolean, delivered?: boolean }} AgentInbound
 */

/**
 * @template {{ priority?: boolean }} T
 * @param {readonly T[]} messages
 * @returns {{ priority: T[], rest: T[] }}
 */
export function partitionAgentInbound(messages) {
  const priority = [];
  const rest = [];
  for (const message of messages) {
    (message.priority === true ? priority : rest).push(message);
  }
  return { priority, rest };
}

/**
 * @template {{ priority?: boolean }} T
 * @param {readonly T[]} messages
 * @returns {T[]}
 */
export function prioritizeAgentInbound(messages) {
  const parts = partitionAgentInbound(messages);
  return [...parts.priority, ...parts.rest];
}

/**
 * @template {{ priority?: boolean }} T
 * @param {readonly T[]} queued
 * @param {readonly T[]} deferred
 * @returns {T[]}
 */
export function mergeAgentInboundQueue(queued, deferred) {
  const newer = partitionAgentInbound(queued);
  const older = partitionAgentInbound(deferred);
  return [...newer.priority, ...older.priority, ...older.rest, ...newer.rest];
}

/**
 * Grok buildAgentInboundWakePrompt skeleton.
 * @param {AgentInbound & { from?: { id?: string, name?: string } }} message
 * @returns {string}
 */
export function buildAgentInboundWakePrompt(message) {
  const fromName = String(
    message.fromName || message.from?.name || message.fromId || 'An agent',
  ).trim();
  const fromId = String(message.fromId || message.from?.id || '').trim();
  const body = clampAgentMessage(message.text);
  const priority = message.priority === true;
  const lines = [
    `${AGENT_INBOUND_WAKE_CUE} A message just arrived from another of your user's agents: ${fromName}${fromId ? ` (id: ${fromId})` : ''}.`,
    priority
      ? 'This is a PRIORITY instruction from another assistant — not the user typing here. It interrupted your previous non-user work. Drop conflicting in-flight work and follow it now. Your user can already see it in this chat.'
      : 'This is another assistant reaching out — not the user typing here. It arrived asynchronously, and your user can already see it in this chat.',
    '',
    `${fromName}: ${body}`,
    '',
    `If it needs a reply or an action, handle it: reply to ${fromName} with ${SAND_SEND_TO_AGENT_TOOL_NAME}${fromId ? ` (their id: ${fromId})` : ''}, which reaches them on a later turn — not a live back-and-forth — and use SendMessage / your user chat only when you have a real result to share. If it is just an FYI with nothing for you to do, it is fine to stay silent — no need to reply just to acknowledge it.`,
  ];
  return lines.join('\n');
}

/**
 * @param {readonly AgentInbound[] | undefined} inbox
 * @param {AgentInbound} message
 * @returns {AgentInbound[]}
 */
export function enqueueAgentInbound(inbox, message) {
  const queued = Array.isArray(inbox) ? [...inbox] : [];
  if (message.priority === true) return [message, ...queued];
  queued.push(message);
  return queued;
}

/**
 * Validate send_to_agent targets. Groups are allowed (post into room).
 * @param {readonly object[]} items
 * @param {string} fromBotId
 * @param {string} toBotId
 * @returns {{ ok: true, from: object, to: object, toGroup: boolean }
 *   | { ok: false, error: string }}
 */
export function resolveSendToAgentTarget(items, fromBotId, toBotId) {
  if (!toBotId || toBotId === fromBotId) {
    return { ok: false, error: "An agent can't message itself." };
  }
  const from = items.find((entry) => entry.id === fromBotId && entry.kind !== 'room');
  const to = items.find((entry) => entry.id === toBotId);
  if (!from) return { ok: false, error: 'Sender is not a catalog bot.' };
  if (!to) return { ok: false, error: `No agent found with id ${toBotId}.` };
  return { ok: true, from, to, toGroup: to.kind === 'room' };
}
