/**
 * Schedules one assistant step's tool calls. Exclusive calls form barriers;
 * parallel calls use a bounded rolling pool and are reclassified before start.
 * Dispatch may overlap, while policy, results, and result context remain
 * model-ordered. Abort or an internal scheduler failure stops replenishment
 * and drains started calls.
 *
 * Abort records synthetic error results for skipped calls so replay stays
 * valid. A terminal scheduler failure keeps the transcript valid too: every
 * started call receives its settled result when the dispatch completed, or a
 * synthetic outcome-unknown result otherwise, and calls that never began
 * receive a synthetic not-started result. The step's assistant tool calls are
 * therefore always fully paired before the turn ends.
 * @module dsh-agent-loop/tool-calls
 */

import type { Context } from '@deepseek-ai/cordis'
import { assertNever, createToolResultMessage, type ToolCallBlock } from '@deepseek-ai/dsh-llm'
import { TOOL_NOT_STARTED, TOOL_OUTCOME_UNKNOWN, type Session, type UserMessage } from '@deepseek-ai/dsh-session'
import { TOOL_ABORTED_BEFORE_DISPATCH, TOOL_RUNTIME_SCHEDULER, type ToolErrorInfo, type ToolExecutionInput, type ToolExecutionMode, type ToolExecutionResult, type ToolRuntimeScheduler, type ToolRunContext } from '@deepseek-ai/dsh-tools'

/** One tool call after argument parsing, ready to schedule. */
interface PlannedCall {
  block: ToolCallBlock
  exec: ToolExecutionInput
}

/** Settled dispatch awaiting model-order finalization. */
interface Slot {
  exec: ToolRunContext
  result: ToolExecutionResult
  needsPost: boolean
}

/** One scheduler group outcome, including a drained cancellation. */
interface GroupOutcome {
  consumed: number
  aborted: boolean
  /** Whether any committed result carried {@link ToolExecutionResult.concludesTurn}. */
  concluded: boolean
  /** Terminal scheduler failure after the group's calls were completed. */
  failed?: { error: unknown }
}

/**
 * Schedule one assistant step's tool calls by their live concurrency mode.
 * Ordinary completion and abort commit started-call results in order. Abort
 * drains them, records synthetic results for unstarted calls, and returns with
 * the signal still aborted after accepting started-call context through the
 * caller-supplied acceptor (the machine stages it in its next-step inbox for the
 * step boundary). An internal scheduler failure stops new dispatches, drains
 * already-started dispatches, completes every started call (its settled result
 * when the dispatch succeeded, an outcome-unknown result otherwise), records
 * not-started results for every call that never began, and rejects with the
 * first failure. The step's assistant tool calls are always fully paired.
 * The committed step's AgentLoop driver boundary supplies the initiating Agent
 * that becomes each explicit {@link ToolExecutionInput.agent}.
 *
 * @param ctx - loop context that owns the tool registry and carries the initiating Agent.
 * @param turn - current turn number.
 * @param step - current step number.
 * @param toolCalls - assistant calls in model order.
 * @param signal - abort signal shared by the step.
 * @param acceptContext - accepts committed result context for the next step boundary.
 */
export async function executeToolCalls(
  ctx: Context,
  turn: number,
  step: number,
  toolCalls: ToolCallBlock[],
  signal: AbortSignal,
  acceptContext: (context: UserMessage) => void,
): Promise<{ concluded: boolean }> {
  const agent = ctx.agents.requireInitiator()
  const { session } = agent

  // Inputs are distinct because tools/execute wrappers may replace `exec.signal`.
  const planned: PlannedCall[] = toolCalls.map(block => ({
    block,
    exec: {
      callId: block.id,
      name: block.name,
      arguments: parseArguments(block.arguments),
      agent,
      signal,
    },
  }))

  let next = 0
  let concluded = false
  let failure: unknown | undefined
  try {
    while (next < planned.length) {
      // Commit before classifying again so registry changes affect unstarted calls.
      // oxlint-disable-next-line typescript/no-non-null-assertion -- bounded by the loop condition
      const first = planned[next]!
      const mode = ctx.tools.executionMode(first.exec).kind
      const group = mode === 'parallel' ? planned.slice(next) : [first]
      const outcome = await runGroup(
        ctx, turn, step, group, mode, signal, acceptContext,
      )
      next += outcome.consumed
      concluded ||= outcome.concluded
      if (outcome.failed !== undefined) {
        // The failing group's started calls were completed inside runGroup; every
        // remaining model call (this group's unstarted calls and later groups)
        // receives a not-started result so the assistant step stays fully paired.
        for (const call of planned.slice(next)) appendSkippedToolCall(session, turn, step, call.block, NOT_STARTED_FAILURE)
        failure = outcome.failed.error
        break
      }
      if (outcome.aborted) {
        for (const call of planned.slice(next)) appendSkippedToolCall(session, turn, step, call.block, ABORT_FAILURE)
        return { concluded }
      }
    }
  } catch (error: unknown) {
    // The scheduler guard or an unexpected pre-dispatch throw: no call in the
    // remaining groups started, so each receives a not-started result before
    // the error surfaces.
    for (const call of planned.slice(next)) appendSkippedToolCall(session, turn, step, call.block, NOT_STARTED_FAILURE)
    throw error
  }
  if (failure !== undefined) throw failure
  return { concluded }
}

/** Parse model arguments, preserving invalid JSON as text and mapping empty input to `{}`. */
function parseArguments(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return raw
  }
}

/**
 * Run one exclusive barrier or parallel pool. Later calls are reclassified
 * before start; an exclusive reclassification waits for the current pool to
 * drain and remains for the caller's next barrier. Results and contexts commit
 * in model order. Abort stops starts, drains and commits started calls, accepts
 * their contexts into the owning batch, records results for skipped calls, and
 * returns an aborted outcome. Scheduler failure drains dispatches, completes
 * every started call (settled results in model order, synthetic outcome-unknown
 * results for the rest), records not-started results for this group's unstarted
 * calls, and returns a failed outcome carrying the first error.
 */
async function runGroup(
  ctx: Context,
  turn: number,
  step: number,
  group: PlannedCall[],
  mode: ToolExecutionMode['kind'],
  signal: AbortSignal,
  acceptContext: (context: UserMessage) => void,
): Promise<GroupOutcome> {
  const { session } = ctx.agents.requireInitiator()
  const { maxParallelToolCalls } = ctx.agentLoop.config
  // Resolve once per group so a missing or duplicated tools module instance
  // fails loudly here, before any call is recorded, instead of as a bare
  // `Cannot read properties of undefined` mid-dispatch.
  const scheduler = requireToolRuntimeScheduler(ctx)
  const slots: (Slot | undefined)[] = group.map(() => undefined)
  // Started slots retain their `tool/call` seq so the result can cite it.
  const callSeqs: number[] = group.map(() => -1)
  // Slots whose finalize/finish already ran and threw; their stage must not
  // run again (the tool may have partially completed side effects).
  const completionAttempted = new Set<number>()
  let nextToStart = 0
  let committed = 0
  let started = 0
  let aborted: boolean = signal.aborted
  let concluded = false
  let schedulerFailure: { error: unknown } | undefined
  const throwSchedulerFailure = (): void => {
    if (schedulerFailure !== undefined) throw schedulerFailure.error
  }

  // `committed` advances only across contiguous model-order slots. A throwing
  // finalize/finish is a scheduler failure: record it, keep the slot
  // uncommitted (its index is marked attempted so the failure completion
  // never re-runs the stage), and let the caller's check surface it.
  const commitReady = async (): Promise<void> => {
    while (committed < group.length) {
      const slot = slots[committed]
      if (slot === undefined) break
      const call = group[committed]
      try {
        const result = slot.needsPost
          ? await scheduler.finalize(slot.exec, slot.result)
          : scheduler.finish(slot.exec, slot.result)
        // oxlint-disable-next-line typescript/no-non-null-assertion -- bounded index
        appendToolResult(session, turn, step, call!.block, result, callSeqs[committed]!)
        for (const context of result.additionalContexts ?? []) acceptContext(context)
        concluded ||= result.concludesTurn === true
        committed++
      } catch (error: unknown) {
        completionAttempted.add(committed)
        schedulerFailure ??= { error }
        return
      }
    }
  }

  const inFlight = new Map<number, Promise<number>>()

  const startCall = async (index: number): Promise<void> => {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- bounded index
    const call = group[index]!
    callSeqs[index] = appendToolCall(session, turn, step, call.block)
    started++
    const prepared = await scheduler.prepare(call.exec)
    throwSchedulerFailure()
    switch (prepared.kind) {
      case 'dispatch': {
        const promise = scheduler.dispatch(prepared.exec).then(
          (outcome) => {
            slots[index] = { exec: prepared.exec, result: outcome.result, needsPost: outcome.kind === 'post-result' }
            return index
          },
          (error: unknown) => {
            schedulerFailure ??= { error }
            return index
          },
        )
        inFlight.set(index, promise)
        break
      }
      case 'post-result':
        slots[index] = { exec: prepared.exec, result: prepared.result, needsPost: true }
        break
      case 'final-result':
        slots[index] = { exec: prepared.exec, result: prepared.result, needsPost: false }
        break
      /* v8 ignore next -- closed-union exhaustiveness guard */
      default:
        assertNever(prepared, 'tool-call scheduler prepare result')
    }
  }

  const fillPool = async (): Promise<void> => {
    while (!aborted && nextToStart < group.length && inFlight.size < maxParallelToolCalls) {
      // Re-read later modes after ordered commits so registry changes can create a barrier.
      // oxlint-disable-next-line typescript/no-non-null-assertion -- bounded by the loop condition
      const nextCall = group[nextToStart]!
      if (nextToStart > 0 && mode === 'parallel'
        && ctx.tools.executionMode(nextCall.exec).kind !== 'parallel') break
      await startCall(nextToStart)
      nextToStart++
      throwSchedulerFailure()
      await commitReady()
      throwSchedulerFailure()
      // Abort may arrive while pre-execute awaits.
      if (signal.aborted) aborted = true
    }
  }

  // Ordered pre-execute may await; only dispatch/body overlaps. A scheduler
  // failure stops new dispatches and reaches the turn boundary after every
  // already-started dispatch settles.
  try {
    await fillPool()
    while (inFlight.size > 0) {
      const settledIndex = await Promise.race(inFlight.values())
      inFlight.delete(settledIndex)
      throwSchedulerFailure()
      await commitReady()
      throwSchedulerFailure()
      // Abort may arrive while a tool or ordered commit awaits.

      if (signal.aborted) aborted = true
      await fillPool()
    }
  } catch (error: unknown) {
    schedulerFailure ??= { error }
    await Promise.allSettled(inFlight.values())
    // Complete every started call in model order before the failure surfaces:
    // commit settled results (their finalize/finish may itself fail, which is
    // then treated as outcome-unknown), and record a synthetic outcome-unknown
    // result for started calls with no committed result. Completion is
    // best-effort — a secondary failure is logged and never masks the first.
    try {
      while (committed < started) {
        const slot = slots[committed]
        // oxlint-disable-next-line typescript/no-non-null-assertion -- bounded index
        const call = group[committed]!
        if (slot !== undefined && !completionAttempted.has(committed)) {
          try {
            const result = slot.needsPost
              ? await scheduler.finalize(slot.exec, slot.result)
              : scheduler.finish(slot.exec, slot.result)
            appendToolResult(session, turn, step, call.block, result, callSeqs[committed]!)
            for (const context of result.additionalContexts ?? []) acceptContext(context)
            concluded ||= result.concludesTurn === true
          } catch {
            appendOutcomeUnknown(session, turn, step, call.block, callSeqs[committed]!)
          }
        } else {
          appendOutcomeUnknown(session, turn, step, call.block, callSeqs[committed]!)
        }
        committed++
      }
      // This group's calls that never began receive a not-started result.
      for (const call of group.slice(started)) {
        appendSkippedToolCall(session, turn, step, call.block, NOT_STARTED_FAILURE)
      }
    } catch (completionError: unknown) {
      ctx.logger.warn(`tool-call scheduler: failure completion aborted: ${String(completionError)}`)
    }
    return { consumed: group.length, aborted, concluded, failed: { error: schedulerFailure.error } }
  }

  if (aborted) {
    // Started calls and accepted context settle first; every remaining model
    // call then receives an ordered synthetic result before the turn aborts.
    for (const call of group.slice(started)) appendSkippedToolCall(session, turn, step, call.block, ABORT_FAILURE)
    return { consumed: group.length, aborted: true, concluded }
  }
  /* v8 ignore next -- unreachable: a non-aborted group commits every started call */
  if (committed !== started) throw new Error('tool-call scheduler: uncommitted settled calls')
  return { consumed: started, aborted: false, concluded }
}

/** Failure detail for a call that never began because the user cancelled the step. */
const ABORT_FAILURE = {
  message: 'tool call aborted before dispatch',
  info: { name: 'AbortError', code: TOOL_ABORTED_BEFORE_DISPATCH },
} as const satisfies ToolFailureDetail

/** Failure detail for a call that never began because the scheduler failed. */
const NOT_STARTED_FAILURE = {
  message: 'tool call did not start: the scheduler failed before dispatch',
  info: { name: 'ToolNotStartedError', code: TOOL_NOT_STARTED },
} as const satisfies ToolFailureDetail

/** Durable failure detail written into a synthetic tool/result. */
interface ToolFailureDetail {
  message: string
  info: ToolErrorInfo
}

/**
 * Append the durable call/result pair for a model call that never began.
 * @param failure - scenario-specific message and canonical error info.
 */
function appendSkippedToolCall(
  session: Session,
  turn: number,
  step: number,
  block: ToolCallBlock,
  failure: ToolFailureDetail,
): void {
  const callSeq = appendToolCall(session, turn, step, block)
  appendToolResult(session, turn, step, block, {
    content: [{ type: 'text', text: `Error: ${failure.message}` }],
    isError: true,
    error: {
      message: failure.message,
      info: { name: failure.info.name, code: failure.info.code },
    },
  }, callSeq)
}

/**
 * Append a synthetic outcome-unknown result for a started call whose settled
 * result could not be completed on terminal scheduler failure. The tool may
 * already have produced side effects, so the text tells the model to verify
 * external state instead of retrying blindly.
 */
function appendOutcomeUnknown(session: Session, turn: number, step: number, block: ToolCallBlock, callSeq: number): void {
  appendToolResult(session, turn, step, block, {
    content: [{
      type: 'text',
      text: 'Error: the tool call failed to complete after it started; its outcome is unknown. If the tool may have side effects, verify external state before retrying.',
    }],
    isError: true,
    error: {
      message: 'tool call dispatch failed; outcome unknown',
      info: { name: 'ToolOutcomeUnknownError', code: TOOL_OUTCOME_UNKNOWN },
    },
  }, callSeq)
}

/**
 * Resolve the tool runtime scheduler, failing loudly with a deployable
 * diagnosis instead of a bare `Cannot read properties of undefined` when the
 * tools module instance is missing or duplicated in this process.
 */
function requireToolRuntimeScheduler(ctx: Context): ToolRuntimeScheduler {
  const scheduler = ctx.tools[TOOL_RUNTIME_SCHEDULER]
  if (scheduler === undefined) {
    throw new Error(
      'dsh-agent-loop: the tool runtime scheduler is unavailable. This usually means two copies of '
      + '@deepseek-ai/dsh-tools are loaded in one process (their scheduler keys then differ). Remove stale '
      + 'copies under $DSH_HOME/profiles/<name>/node_modules and rebuild the packaged runtime.',
    )
  }
  return scheduler
}

/** Append a started call and return the event seq that its result must cite. */
function appendToolCall(session: Session, turn: number, step: number, block: ToolCallBlock): number {
  const event = session.append('tool/call', { turn, step, callId: block.id, name: block.name, arguments: block.arguments })
  return event.seq
}

/** Append a model-ordered result linked to its call event. */
function appendToolResult(
  session: Session,
  turn: number,
  step: number,
  block: ToolCallBlock,
  result: ToolExecutionResult,
  callSeq: number,
): void {
  const message = createToolResultMessage({
    callId: block.id,
    content: result.content,
    isError: result.isError,
  })
  session.append('tool/result', {
    turn, step,
    message,
    ...result.error?.info ? { error: result.error.info } : {},
    // The tool's private presentation payload (e.g. a result-time diff),
    // persisted so a UI bridge reproduces the card on replay.
    ...result.meta !== undefined ? { meta: result.meta } : {},
  }, { surfaceOp: 'append', sourceEventSeqs: [callSeq] })
}
