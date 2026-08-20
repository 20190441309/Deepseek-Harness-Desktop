/**
 * Host apply for dshbot: settings catalog, 1:1 persona injection, room
 * llm/stream dispatch (no chat model), the global ask_participant tool,
 * and a continuable-child complete persona so room members do not inherit
 * the harness identity.
 */
import z from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import {
  childPersonaForSession,
  DEFAULT_MAX_ROUNDS,
  DEFAULT_MAX_SPEAKS,
  isRoomConversationRequest,
  memberPersona,
  personaText,
  roomDispatchChunks,
  emptyStopChunks,
} from './catalog.js';
import { registerAskParticipant } from './ask-participant.js';

export const name = 'dsh-bot';
export const inject = ['settings', 'systemPrompt', 'subagents', 'llm', 'sessions', 'tools'];

export const Config = z.object({
  maxSpeaks: z.number().default(DEFAULT_MAX_SPEAKS),
  maxRounds: z.number().default(DEFAULT_MAX_ROUNDS),
});

const NS = settingsNamespace('dshbot');

const ModelSchema = z.object({
  provider: z.string(),
  model: z.string(),
  reasoningEffort: z.string(),
});

const MemberChildSchema = z.object({
  botId: z.string(),
  sessionId: z.string(),
});

const AvatarSchema = z.object({
  kind: z.string(),
  shape: z.string().default(''),
  color: z.string().default(''),
  dataUrl: z.string().default(''),
  crop: z.string().default(''),
});

const ItemSchema = z.object({
  id: z.string(),
  kind: z.string().default('bot'),
  sessionId: z.string(),
  name: z.string(),
  title: z.string().default(''),
  description: z.string().default(''),
  avatar: AvatarSchema.default({ kind: 'blob' }),
  model: ModelSchema,
  workspaceId: z.string(),
  notifications: z.boolean().default(true),
  memberBotIds: z.array(z.string()).default([]),
  memberChildren: z.array(MemberChildSchema).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const CatalogSchema = z.object({
  items: z.array(ItemSchema).default([]),
});

/**
 * Register the catalog namespace, room stream dispatch, and per-session persona.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ maxSpeaks?: number, maxRounds?: number }} [config]
 */
export function apply(ctx, config = {}) {
  const maxSpeaks = config.maxSpeaks ?? DEFAULT_MAX_SPEAKS;
  const maxRounds = config.maxRounds ?? DEFAULT_MAX_ROUNDS;
  registerAskParticipant(ctx);
  const scope = ctx.settings.register(NS, CatalogSchema);
  ctx.on('llm/stream', (options, next) => {
    const items = scope.get()?.items ?? [];
    if (!isRoomConversationRequest(options, items)) return next();
    const session = options.sessionId ? ctx.sessions.get(options.sessionId) : undefined;
    const chunks = roomDispatchChunks({
      items,
      sessionId: options.sessionId,
      events: session?.events ?? [],
      callId: globalThis.crypto.randomUUID(),
      maxSpeaks,
      maxRounds,
    }) ?? emptyStopChunks();
    return (async function* () {
      for (const chunk of chunks) yield chunk;
    })();
  });
  ctx.subagents.registerContinuableSetup((childCtx) => {
    const sessionId = childCtx.agent?.session?.id ?? childCtx.agent?.id;
    const items = scope.get()?.items ?? [];
    const text = memberPersona.getStore() || childPersonaForSession(items, sessionId);
    if (!text) return () => {};
    return childCtx.systemPrompt.section({
      name: 'dshbot:member',
      order: 1,
      complete: true,
      text,
    });
  });
  ctx.systemPrompt.section({
    name: 'dshbot:persona',
    order: 20,
    text: (assembleCtx) => {
      const sessionId = assembleCtx.agent?.session?.id ?? assembleCtx.agent?.id;
      const items = scope.get()?.items ?? [];
      return personaText(items, sessionId);
    },
  });
}
