// dsh-usage-panel · per-session persisted projection (the accounting core).
//
// Registered via ctx.sessionProjections.register() so DSH folds one event per
// committed session event and checkpoints the state durably (write-behind by
// sessionProjectionCache, cold-read ladder by restore/coldSnapshot). The
// reducer is a pure function over plain-JSON state — fully unit-testable and
// replay-safe across stateVersion bumps.
//
// Accounting rules (all deliberate, see iteration-strategy §4.6):
//  - Four DISJOINT buckets per DSH TokenUsage: input is uncached only.
//  - Fork dedup: events with seq < the LAST session/end-seed are seed history
//    (fork/resume/replay) and are never counted — our v0.1.0 seedLength
//    correctness wall, preserved inside the projection.
//  - Model attribution: request/context.model base, request/header.config.model
//    overrides (v0.1.0 semantic); provider tracked the same way.
//  - Per-step replacement: assistant/chunk provisional usage accumulates per
//    (turn:step); the step's assistant/message REPLACES it (authoritative), so
//    a retried same-step message cannot double-count (v0.1.0 bug, fixed).
//    Commit happens at step/end (or the next step's first event / turn/end).
//  - llm/retry events are counted as retries, never as token usage.
//  - compaction/summary usage is attributed to its own model AND tracked in
//    compactionTokens (visible, never mixed silently into regular output).
//  - reasoningTokens are already inside outputTokens — never added again.
//  - Day keys are UTC.
import { z } from 'zod'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { dayKeyUTC } from '../shared/usage.ts'

const bucketSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
})

const stepSchema = z.object({
  buckets: bucketSchema,
  lastTime: z.number(),
  model: z.string(),
  provider: z.string(),
  mode: z.enum(['provisional', 'authoritative']),
})

export const usagePanelSchema = z.object({
  totals: bucketSchema,
  byModel: z.record(z.string(), bucketSchema),
  byDay: z.record(z.string(), z.record(z.string(), bucketSchema)),
  byProvider: z.record(z.string(), bucketSchema),
  retries: z.number(),
  compactionTokens: z.number(),
  firstTime: z.number().nullable(),
  lastTime: z.number().nullable(),
  seedEnd: z.number().nullable(),
  currentModel: z.string(),
  currentProvider: z.string(),
  openStep: z.string().nullable(),
  steps: z.record(z.string(), stepSchema),
})

export type Buckets = z.infer<typeof bucketSchema>
export type StepState = z.infer<typeof stepSchema>
export type UsagePanelState = z.infer<typeof usagePanelSchema>

export const USAGE_PANEL_KEY = 'usagePanel'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    usagePanel: UsagePanelState
  }
  interface SessionProjectionStateMap {
    usagePanel: UsagePanelState
  }
}

const EMPTY: Buckets = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })

export function initState(): UsagePanelState {
  return {
    totals: { ...EMPTY },
    byModel: {},
    byDay: {},
    byProvider: {},
    retries: 0,
    compactionTokens: 0,
    firstTime: null,
    lastTime: null,
    seedEnd: null,
    currentModel: 'unknown',
    currentProvider: 'unknown',
    openStep: null,
    steps: {},
  }
}

function stepKey(turn: number, step: number): string {
  return turn + ':' + step
}

function add(a: Buckets, b: Buckets): Buckets {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  }
}

function addInto(map: Record<string, Buckets>, key: string, b: Buckets): Record<string, Buckets> {
  const cur = map[key]
  return { ...map, [key]: cur ? add(cur, b) : { ...b } }
}

function addIntoDay(
  byDay: Record<string, Record<string, Buckets>>,
  day: string,
  model: string,
  b: Buckets,
): Record<string, Record<string, Buckets>> {
  const dayMap = byDay[day]
  return { ...byDay, [day]: dayMap ? addInto(dayMap, model, b) : { [model]: { ...b } } }
}

/**
 * Whether an event may be counted. The registry folds a cold log in ONE pass
 * (init + apply per event, no lookahead), so the unit arms itself: nothing is
 * counted until the LAST session/end-seed marker has been seen, and only
 * events at/after the marker's seq (live history) count. Seed events that
 * precede the marker in a cold fold are therefore never counted — the v0.1.0
 * seedLength correctness wall, preserved inside the projection.
 */
function isCounted(state: UsagePanelState, event: SessionEvent): boolean {
  return state.seedEnd !== null && event.seq >= state.seedEnd
}

function touchTime(state: UsagePanelState, time: number): UsagePanelState {
  if (state.firstTime === null || time < state.firstTime || time > (state.lastTime ?? 0)) {
    return {
      ...state,
      firstTime: state.firstTime === null ? time : Math.min(state.firstTime, time),
      lastTime: state.lastTime === null ? time : Math.max(state.lastTime, time),
    }
  }
  return state
}

/** Fold one step's buckets into the aggregates (pure; call once per step). */
function commitStep(state: UsagePanelState, key: string): UsagePanelState {
  const step = state.steps[key]
  if (!step) return state
  const b = step.buckets
  if (b.input === 0 && b.output === 0 && b.cacheRead === 0 && b.cacheWrite === 0) {
    // Zero usage still folds nothing; drop the step bookkeeping only.
    const steps = { ...state.steps }
    delete steps[key]
    return { ...state, steps, openStep: state.openStep === key ? null : state.openStep }
  }
  const day = dayKeyUTC(step.lastTime)
  const next: UsagePanelState = {
    ...state,
    totals: add(state.totals, b),
    byModel: addInto(state.byModel, step.model, b),
    byDay: addIntoDay(state.byDay, day, step.model, b),
    byProvider: addInto(state.byProvider, step.provider, b),
    firstTime: state.firstTime === null ? step.lastTime : Math.min(state.firstTime, step.lastTime),
    lastTime: state.lastTime === null ? step.lastTime : Math.max(state.lastTime, step.lastTime),
    steps: { ...state.steps },
    openStep: state.openStep === key ? null : state.openStep,
  }
  delete next.steps[key]
  return next
}

function commitOpenStep(state: UsagePanelState, incomingKey: string): UsagePanelState {
  if (state.openStep !== null && state.openStep !== incomingKey) {
    return commitStep(state, state.openStep)
  }
  return state
}

/**
 * Pure transition: previous state + one committed session event → next state.
 * Returns the SAME reference for unrelated events (zero downstream work, per
 * the registry contract). State is plain JSON (persisted-cache precondition).
 */
export function applyEvent(state: UsagePanelState, event: SessionEvent): UsagePanelState {
  switch (event.type) {
    case 'session/end-seed': {
      // Last marker wins: a preset (cold fold) or earlier marker must not be
      // overwritten by an older one.
      if (state.seedEnd !== null && event.seq <= state.seedEnd) return state
      return { ...state, seedEnd: event.seq }
    }
    case 'request/context': {
      const { model, provider } = event.data
      if (!model && !provider) return state
      return {
        ...state,
        currentModel: model || state.currentModel,
        currentProvider: provider || state.currentProvider,
      }
    }
    case 'request/header': {
      const cfg = event.data.header && event.data.header.config
      if (!cfg || (!cfg.model && !cfg.provider)) return state
      return {
        ...state,
        currentModel: cfg.model || state.currentModel,
        currentProvider: cfg.provider || state.currentProvider,
      }
    }
    case 'assistant/chunk': {
      if (!isCounted(state, event)) return state
      const chunk = event.data.chunk
      if (!chunk || chunk.type !== 'usage' || !chunk.usage) return state
      const key = stepKey(event.data.turn, event.data.step)
      const usage = chunk.usage
      const b = {
        input: Number(usage.inputTokens) || 0,
        output: Number(usage.outputTokens) || 0,
        cacheRead: Number(usage.cacheReadTokens) || 0,
        cacheWrite: Number(usage.cacheWriteTokens) || 0,
      }
      let next = commitOpenStep(state, key)
      const existing = next.steps[key]
      const step: StepState = existing
        ? { ...existing, buckets: add(existing.buckets, b), lastTime: event.time }
        : {
            buckets: b,
            lastTime: event.time,
            model: next.currentModel,
            provider: next.currentProvider,
            mode: 'provisional',
          }
      return {
        ...next,
        steps: { ...next.steps, [key]: step },
        openStep: key,
      }
    }
    case 'assistant/message': {
      if (!isCounted(state, event)) return state
      const usage = event.data.usage
      if (!usage) return state
      const key = stepKey(event.data.turn, event.data.step)
      const b = {
        input: Number(usage.inputTokens) || 0,
        output: Number(usage.outputTokens) || 0,
        cacheRead: Number(usage.cacheReadTokens) || 0,
        cacheWrite: Number(usage.cacheWriteTokens) || 0,
      }
      let next = commitOpenStep(state, key)
      const step: StepState = {
        buckets: b,
        lastTime: event.time,
        model: next.currentModel,
        provider: next.currentProvider,
        mode: 'authoritative',
      }
      return {
        ...next,
        steps: { ...next.steps, [key]: step },
        openStep: key,
      }
    }
    case 'step/end': {
      const key = stepKey(event.data.turn, event.data.step)
      return commitStep(state, key)
    }
    case 'turn/end': {
      // Safety net for logs that end mid-step: commit the open step.
      return state.openStep !== null ? commitStep(state, state.openStep) : state
    }
    case 'llm/retry': {
      if (!isCounted(state, event)) return state
      return touchTime({ ...state, retries: state.retries + 1 }, event.time)
    }
    case 'compaction/summary': {
      if (!isCounted(state, event)) return state
      const usage = event.data.usage
      if (!usage) return state
      const b = {
        input: Number(usage.inputTokens) || 0,
        output: Number(usage.outputTokens) || 0,
        cacheRead: Number(usage.cacheReadTokens) || 0,
        cacheWrite: Number(usage.cacheWriteTokens) || 0,
      }
      const model = event.data.model || state.currentModel
      const provider = event.data.provider || state.currentProvider
      const day = dayKeyUTC(event.time)
      return {
        ...state,
        totals: add(state.totals, b),
        byModel: addInto(state.byModel, model, b),
        byDay: addIntoDay(state.byDay, day, model, b),
        byProvider: addInto(state.byProvider, provider, b),
        compactionTokens: state.compactionTokens + b.input + b.output + b.cacheRead + b.cacheWrite,
        firstTime: state.firstTime === null ? event.time : Math.min(state.firstTime, event.time),
        lastTime: state.lastTime === null ? event.time : Math.max(state.lastTime, event.time),
      }
    }
    default:
      return state
  }
}

/**
 * Fold a full event list from init (cold read path / tests). Two-pass: the
 * LAST session/end-seed marker in stored history is the seed boundary
 * (doc: "Locate the LAST one in stored history"), so it is located first and
 * preset — a single forward pass would count seed events that precede the
 * marker. The registry's own lazy cold fold is single-pass (init + apply),
 * where the unit self-arms: nothing is counted until a marker has been seen.
 */
export function foldEvents(events: readonly SessionEvent[]): UsagePanelState {
  let seedEnd: number | null = null
  for (const event of events) {
    if (event.type === 'session/end-seed') seedEnd = event.seq
  }
  let state = { ...initState(), seedEnd }
  for (const event of events) state = applyEvent(state, event)
  return state
}

/** Sum a session's day buckets whose key >= cutoffKey (recent-30d window). */
export function recentOf(value: UsagePanelState, cutoffKey: string): { totals: Buckets; byModel: Record<string, Buckets> } {
  const totals: Buckets = { ...EMPTY }
  const byModel: Record<string, Buckets> = {}
  for (const day of Object.keys(value.byDay)) {
    if (day < cutoffKey) continue
    for (const model of Object.keys(value.byDay[day]!)) {
      const b = value.byDay[day]![model]!
      totals.input += b.input
      totals.output += b.output
      totals.cacheRead += b.cacheRead
      totals.cacheWrite += b.cacheWrite
      const cur = byModel[model]
      byModel[model] = cur
        ? {
            input: cur.input + b.input,
            output: cur.output + b.output,
            cacheRead: cur.cacheRead + b.cacheRead,
            cacheWrite: cur.cacheWrite + b.cacheWrite,
          }
        : { ...b }
    }
  }
  return { totals, byModel }
}
