/**
 * Group member activity transitions (Grok sand-activity createGroupMemberActivityTracker).
 */

export const THINKING_ACTIVITY = { kind: 'thinking' };

/**
 * @typedef {{ type: 'keep' | 'clear' } | { type: 'set', activity: { kind: string, tool?: string, detail?: string, callId?: string } }} ActivityTransition
 * @typedef {{ type: string, text?: string, name?: string, status?: string, id?: string, args?: string, summary?: string }} ActivityUpdate
 */

/**
 * @param {ActivityUpdate} update
 * @returns {ActivityTransition}
 */
export function deriveActivityFromUpdate(update) {
  if (update.type === 'thinking-delta' || update.type === 'text-delta') {
    return { type: 'set', activity: THINKING_ACTIVITY };
  }
  if (update.type === 'send-message' || update.type === 'turn-ended') {
    return { type: 'clear' };
  }
  if (update.type !== 'tool-call') return { type: 'keep' };
  if (update.name === 'send_room_message' || update.name === 'SendMessage' || update.status !== 'pending') {
    return { type: 'keep' };
  }
  return {
    type: 'set',
    activity: {
      kind: 'tool',
      tool: String(update.name ?? 'tool'),
      callId: String(update.id ?? ''),
    },
  };
}

/**
 * Tracker for a group member turn: text streaming clears activity; thinking only before stream.
 * @returns {(update: ActivityUpdate) => ActivityTransition}
 */
export function createGroupMemberActivityTracker() {
  let streaming = false;
  return (update) => {
    if (update.type === 'text-delta') {
      if (!update.text || update.text.length === 0) return { type: 'keep' };
      streaming = true;
      return { type: 'clear' };
    }
    if (update.type === 'thinking-delta') {
      return streaming ? { type: 'keep' } : { type: 'set', activity: THINKING_ACTIVITY };
    }
    if (update.type === 'tool-call' && update.status === 'pending') {
      streaming = false;
      if (update.name === 'send_room_message' || update.name === 'SendMessage') {
        return { type: 'clear' };
      }
    }
    if (update.type === 'send-message' || update.type === 'turn-ended') {
      streaming = false;
    }
    return deriveActivityFromUpdate(update);
  };
}
