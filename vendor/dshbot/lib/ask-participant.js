/**
 * ask_participant: one catalog member speaks in the group as a one-shot child.
 * The profile plugin registers it globally. The dshbot-room preset apply only
 * restricts the room agent to that tool. Members hear the named group log
 * plus a first/later seat instruction.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import {
  childPersonaText,
  groupTranscript,
  lastUserText,
  memberDisplayName,
  memberPersona,
  resolveAskTarget,
  roomSpeakInstruction,
  speakerSeat,
} from './catalog.js';

export const name = 'dshbot-ask-participant';
export const inject = ['tools'];

const NS = settingsNamespace('dshbot');
const SPAWN_PROVIDER = 'spawn';

function blocksText(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

/**
 * Register ask_participant on the calling context (profile host: global).
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function registerAskParticipant(ctx) {
  ctx.tools.register(defineTool({
    name: 'ask_participant',
    description:
      'One room member speaks in the group. botId is that member\'s catalog id.',
    timeoutMs: 300000,
    parameters: {
      botId: {
        type: 'string',
        required: true,
        description: 'Catalog id of the room member who should speak.',
      },
      instruction: {
        type: 'string',
        required: true,
        description: 'Seat instruction for this member: answer first, or pass unless adding a distinct point.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          botId: { type: 'string', required: true },
          name: { type: 'string', required: true },
          text: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.text,
      }],
    },
    presentCall: (args) => {
      const items = ctx.settings.get(NS)?.items ?? [];
      return {
        card: 'generic',
        title: memberDisplayName(items, args.botId),
        kind: 'other',
        content: [],
      };
    },
    presentResult: (_args, result) => {
      if (result.ok !== true) return undefined;
      const value = result.value;
      if (typeof value !== 'object' || value === null) return undefined;
      const name = typeof value.name === 'string' ? value.name : 'Bot';
      const text = typeof value.text === 'string' ? value.text : '';
      return {
        card: 'generic',
        title: name,
        content: [{ type: 'text', text }],
      };
    },
    async execute(args, exec) {
      const parent = exec.agent;
      if (!parent) {
        throw new Error('ask_participant requires a calling agent');
      }
      const catalog = ctx.settings.get(NS);
      const items = catalog?.items ?? [];
      const target = resolveAskTarget(items, parent.session.id, args.botId);
      const bot = target.bot;
      const others = (target.room.memberBotIds ?? [])
        .filter((id) => id !== bot.id)
        .map((id) => items.find((entry) => entry.id === id && entry.kind !== 'room'))
        .filter(Boolean);
      const events = parent.session.events;
      const transcript = groupTranscript(events, items);
      const instruction = roomSpeakInstruction(events, items)
        || String(args.instruction ?? '')
        || lastUserText(parent.session.deriveMessages());
      const heard = [transcript, instruction].filter(Boolean).join('\n\n');
      const prompt = [{ type: 'text', text: heard }];
      const agentOptions = bot.model
        ? { provider: bot.model.provider, model: bot.model.model }
        : undefined;
      const persona = childPersonaText(bot, others, { seat: speakerSeat(events) });
      const run = await memberPersona.run(persona, () => ctx.subagents.start(SPAWN_PROVIDER, {
        label: bot.name,
        prompt,
        parent,
        signal: exec.signal,
        persona,
        toolFilter: { allow: [] },
        ...(agentOptions ? { agentOptions } : {}),
      }));
      try {
        const result = await run.result;
        return { botId: bot.id, name: bot.name, text: blocksText(result.output) };
      } finally {
        await run.dispose();
      }
    },
  }));
}

/**
 * Room agent: keep only the plugin's global ask_participant.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.tools.restrict({ allow: ['ask_participant'] });
}
