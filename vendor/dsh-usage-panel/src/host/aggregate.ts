// dsh-usage-panel · merge per-session projection values into one Overview.
// Pure functions shared by the projection scan path (tests included).
import type { Buckets, CoverageStats, DayRecord, ModelItem, Overview, ProviderItem, SessionSummary, UsageTotals } from '../shared/contract.ts'
import {
  HEAT_DAYS,
  RECENT_DAYS,
  buildDayWindow,
  dayKeyUTC,
  emptyTotals,
  mergeInto,
  sortedModels,
  totalsFrom,
  totalsFromModels,
} from '../shared/usage.ts'
import { recentOf, type UsagePanelState } from './projection.ts'

export interface SessionAgg {
  id: string
  totals: UsageTotals
  lastActive: number
  depth: number
}

export interface Aggregate {
  allTimeTotals: UsageTotals
  allTimeByModel: Record<string, Buckets>
  allTimeByProvider: Record<string, Buckets>
  byDay: Record<string, Record<string, Buckets>>
  recentTotals: UsageTotals
  recentByModel: Record<string, Buckets>
  recentSessionCount: number
  allTimeSessionCount: number
  retries: number
  compactionTokens: number
  from: number | null
  to: number | null
  usageSessionsMain: number
  usageSessionsSubagent: number
  sessions: SessionAgg[]
}

export function emptyAggregate(): Aggregate {
  return {
    allTimeTotals: emptyTotals(),
    allTimeByModel: {},
    allTimeByProvider: {},
    byDay: {},
    recentTotals: emptyTotals(),
    recentByModel: {},
    recentSessionCount: 0,
    allTimeSessionCount: 0,
    retries: 0,
    compactionTokens: 0,
    from: null,
    to: null,
    usageSessionsMain: 0,
    usageSessionsSubagent: 0,
    sessions: [],
  }
}

/** Merge one session's projection value into the aggregate (pure). */
export function mergeSessionValue(a: Aggregate, value: UsagePanelState, sessionId: string, now: number, depth = 0): Aggregate {
  const cutoffKey = dayKeyUTC(now - RECENT_DAYS * 24 * 3600 * 1000)
  const recent = recentOf(value, cutoffKey)
  const totals = totalsFrom(value.totals)
  const next: Aggregate = {
    ...a,
    allTimeTotals: {
      input: a.allTimeTotals.input + totals.input,
      output: a.allTimeTotals.output + totals.output,
      cacheRead: a.allTimeTotals.cacheRead + totals.cacheRead,
      cacheWrite: a.allTimeTotals.cacheWrite + totals.cacheWrite,
      total: a.allTimeTotals.total + totals.total,
    },
    recentTotals: {
      input: a.recentTotals.input + recent.totals.input,
      output: a.recentTotals.output + recent.totals.output,
      cacheRead: a.recentTotals.cacheRead + recent.totals.cacheRead,
      cacheWrite: a.recentTotals.cacheWrite + recent.totals.cacheWrite,
      total:
        a.recentTotals.total +
        recent.totals.input +
        recent.totals.output +
        recent.totals.cacheRead +
        recent.totals.cacheWrite,
    },
    retries: a.retries + value.retries,
    compactionTokens: a.compactionTokens + value.compactionTokens,
    from: a.from === null ? value.firstTime : value.firstTime === null ? a.from : Math.min(a.from, value.firstTime),
    to: a.to === null ? value.lastTime : value.lastTime === null ? a.to : Math.max(a.to, value.lastTime),
  }
  // Merge nested maps with clone-on-write.
  for (const model of Object.keys(value.byModel)) {
    const b = value.byModel[model]!
    const cur = next.allTimeByModel[model]
    next.allTimeByModel[model] = cur ? mergeB(cur, b) : { ...b }
  }
  for (const provider of Object.keys(value.byProvider)) {
    const b = value.byProvider[provider]!
    const cur = next.allTimeByProvider[provider]
    next.allTimeByProvider[provider] = cur ? mergeB(cur, b) : { ...b }
  }
  for (const day of Object.keys(value.byDay)) {
    const dayMap = value.byDay[day]!
    const target = next.byDay[day] || (next.byDay[day] = {})
    for (const model of Object.keys(dayMap)) {
      const b = dayMap[model]!
      const cur = target[model]
      target[model] = cur ? mergeB(cur, b) : { ...b }
    }
  }
  for (const model of Object.keys(recent.byModel)) {
    const b = recent.byModel[model]!
    const cur = next.recentByModel[model]
    next.recentByModel[model] = cur ? mergeB(cur, b) : { ...b }
  }
  if (recent.totals.input + recent.totals.output + recent.totals.cacheRead + recent.totals.cacheWrite > 0) {
    next.recentSessionCount += 1
  }
  if (totals.total > 0) {
    next.allTimeSessionCount += 1
    if (depth > 0) next.usageSessionsSubagent += 1
    else next.usageSessionsMain += 1
    next.sessions.push({ id: sessionId, totals, lastActive: value.lastTime ?? 0, depth })
  }
  return next
}

function mergeB(a: Buckets, b: Buckets): Buckets {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  }
}

export function rankSessions(sessions: SessionAgg[], limit: number): SessionAgg[] {
  return [...sessions].sort((a, b) => b.totals.total - a.totals.total).slice(0, limit)
}

export interface FinalizeInput {
  aggregate: Aggregate
  now: number
  mode: CoverageStats['mode']
  sessionsTotal: number
  sessionsOk: number
  sessionsFailed: number
  sessionsPending: number
  eventsCounted: number
  titles: Map<string, string | null>
  providerNames: Record<string, string>
}

/** Build the wire Overview from an aggregate (both scan modes converge here). */
export function finalizeOverview(input: FinalizeInput): Overview {
  const { aggregate: a, now, mode, sessionsTotal, sessionsOk, sessionsFailed, sessionsPending, eventsCounted, titles, providerNames } = input
  const recentByModel = sortedModels(a.recentByModel)
  const allTimeByModel = sortedModels(a.allTimeByModel)
  const providerRows: ProviderItem[] = Object.keys(a.allTimeByProvider)
    .map((id) => {
      const b = a.allTimeByProvider[id]!
      return { id, name: providerNames[id] || id, totals: totalsFrom(b) }
    })
    .sort((x, y) => y.totals.total - x.totals.total)
  const top = rankSessions(a.sessions, 10)
  const topSessions: SessionSummary[] = top.map((s) => ({
    id: s.id,
    title: titles.has(s.id) ? titles.get(s.id)! : null,
    totals: s.totals,
    lastActive: s.lastActive,
    depth: s.depth,
  }))
  const coverage: CoverageStats = {
    mode,
    timezone: 'UTC',
    sessionsTotal,
    sessionsOk,
    sessionsFailed,
    sessionsPending,
    eventsCounted,
    retries: a.retries,
    compactionTokens: a.compactionTokens,
    from: a.from,
    to: a.to,
    usageSessionsMain: a.usageSessionsMain,
    usageSessionsSubagent: a.usageSessionsSubagent,
  }
  return {
    days: buildDayWindow(a.byDay, now),
    totals: totalsFromModels(recentByModel),
    sessionCount: a.recentSessionCount,
    byModel: recentByModel,
    allTime: {
      totals: totalsFromModels(allTimeByModel),
      sessionCount: a.allTimeSessionCount,
      byModel: allTimeByModel,
    },
    coverage,
    topSessions,
    providers: providerRows,
    updatedAt: now,
  }
}

export function emptyOverview(now: number): Overview {
  return finalizeOverview({
    aggregate: emptyAggregate(),
    now,
    mode: 'none',
    sessionsTotal: 0,
    sessionsOk: 0,
    sessionsFailed: 0,
    sessionsPending: 0,
    eventsCounted: 0,
    titles: new Map(),
    providerNames: {},
  })
}

export const HEAT_DAYS_UTC = HEAT_DAYS

export type { DayRecord }
