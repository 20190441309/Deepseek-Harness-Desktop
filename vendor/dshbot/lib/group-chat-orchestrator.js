/**
 * GroupChatOrchestrator — Grok group-chat-orchestrator.ts semantics.
 */
import {
  GROUP_MAX_MEMBER_TURNS,
  GROUP_MAX_MESSAGES_PER_TURN,
  GROUP_MAX_ROUNDS,
  buildGroupMemberSystemPrompt,
  buildGroupTurnPrompt,
  isPassContent,
  messagesSinceMemberLastSpoke,
  orderRoundSpeakers,
  resolveResponders,
} from './group-chat.js';

/**
 * @typedef {import('./group-chat.js').GroupMember} GroupMember
 * @typedef {import('./group-chat.js').GroupDescription} GroupDescription
 * @typedef {import('./group-chat.js').GroupMessage} GroupMessage
 */

/**
 * @typedef {{
 *   resolveMembers: (ids: readonly string[]) => Promise<GroupMember[]> | GroupMember[],
 *   readHistory: () => readonly GroupMessage[],
 *   isCurrent: () => boolean,
 *   runMemberTurn: (args: {
 *     member: GroupMember,
 *     systemPrompt: string,
 *     prompt: string,
 *   }) => Promise<string[]>,
 *   postMemberMessage: (member: GroupMember, content: string) => void,
 *   finalizeMemberTurn?: (member: GroupMember) => void,
 *   isSharedRoom?: boolean,
 * }} GroupOrchestratorDeps
 */

export class GroupChatOrchestrator {
  /**
   * @param {GroupOrchestratorDeps} deps
   */
  constructor(deps) {
    this.deps = deps;
  }

  /**
   * @param {{ group: GroupDescription, memberIds: readonly string[] }} args
   */
  async run(args) {
    const members = await this.deps.resolveMembers(args.memberIds);
    if (members.length === 0) return;

    const memberById = new Map(members.map((member) => [member.id, member]));
    let totalMessages = 0;

    for (let round = 0; round < GROUP_MAX_ROUNDS; round += 1) {
      if (!this.deps.isCurrent()) return;
      const responderIds = resolveResponders(members, this.deps.readHistory()).map(
        (member) => member.id,
      );
      let messagesThisRound = 0;

      for (const memberId of orderRoundSpeakers(responderIds, round)) {
        if (totalMessages >= GROUP_MAX_MEMBER_TURNS || !this.deps.isCurrent()) return;
        const member = memberById.get(memberId);
        if (member == null) continue;

        const sent = await this.runOneTurn(args.group, member, members);
        let hitCap = false;
        for (const content of sent) {
          this.deps.postMemberMessage(member, content);
          totalMessages += 1;
          messagesThisRound += 1;
          if (totalMessages >= GROUP_MAX_MEMBER_TURNS) {
            hitCap = true;
            break;
          }
        }
        this.deps.finalizeMemberTurn?.(member);
        if (hitCap) return;
      }

      if (messagesThisRound === 0) return;
    }
  }

  /**
   * @param {GroupDescription} group
   * @param {GroupMember} member
   * @param {readonly GroupMember[]} members
   * @returns {Promise<string[]>}
   */
  async runOneTurn(group, member, members) {
    const peers = members.filter((other) => other.id !== member.id);
    const history = this.deps.readHistory();
    const newMessages = this.deps.isSharedRoom === true
      ? history.slice(-24)
      : messagesSinceMemberLastSpoke(history, member.id);
    const sent = await this.deps.runMemberTurn({
      member,
      systemPrompt: buildGroupMemberSystemPrompt(member, group, peers, {
        isSharedRoom: this.deps.isSharedRoom === true,
      }),
      prompt: buildGroupTurnPrompt({ member, group, peers, newMessages }),
    });

    const spoken = [];
    for (const content of sent) {
      if (isPassContent(content)) continue;
      const trimmed = String(content ?? '').trim();
      if (trimmed.length === 0) continue;
      spoken.push(trimmed);
      if (spoken.length >= GROUP_MAX_MESSAGES_PER_TURN) break;
    }
    return spoken;
  }
}
