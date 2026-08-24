// dsh-usage-panel · Host face (web plugin entry).
//
// Data path: inject waits for sessionProjections / sessionQuery /
// sessionProjectionCache, then register() installs a client-visible unit
// (stateSchema + wire). The framework folds events; scans read
// coldSnapshot.values.usagePanel. A missing cell is pending, never a
// readSession replay. register() throw fails soft to the full rescan.
//
// Reads are served with stale-while-revalidate: fresh for 10 minutes; older
// payloads return instantly with `stale: true` while a background rescan
// refreshes; the refresh button forces a synchronous scan. Read-only.
import type { Context } from '@deepseek-ai/cordis'
import type { SessionQueryEngine, SessionRecord } from '@deepseek-ai/dsh-session-query'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import type { SessionProjectionCache } from '@deepseek-ai/dsh-session-projection-cache'
import { RPC_CHANNEL, RPC_OVERVIEW, type CoverageStats, type Overview, type RpcResult } from '../shared/contract.ts'
import { emptyAggregate, emptyOverview, finalizeOverview, mergeSessionValue, rankSessions } from './aggregate.ts'
import { usagePanelProjectionDefinition } from './projection-unit.ts'
import { scanFallback } from './scan.ts'
import type { HostConnection, HostLlm } from './types.ts'

export const name = 'dsh-usage-panel'
export const inject = [
  'timer',
  'connection',
  'sessionProjections',
  'sessionQuery',
  'sessionProjectionCache',
]

const STALE_MS = 10 * 60 * 1000 // cache freshness window
const RESCAN_MS = 10 * 60 * 1000 // periodic keep-warm rescan

export function apply(ctx: Context): void {
  const tag = '[dsh-usage-panel]'
  const sq = ctx.get('sessionQuery') as SessionQueryEngine
  const registry = ctx.get('sessionProjections') as SessionProjectionRegistry
  const projCache = ctx.get('sessionProjectionCache') as SessionProjectionCache
  const connection = ctx.get('connection') as HostConnection | undefined
  const llm = ctx.get('llm') as HostLlm | undefined

  let mode: CoverageStats['mode'] = 'projection'

  console.log(
    tag,
    'boot: mode=' + mode,
    'services: sessionQuery=' + Boolean(sq) + ' sessionProjections=' + Boolean(registry) + ' sessionProjectionCache=' + Boolean(projCache),
  )

  // Registration is an effect on this fiber: the unit's key disappears when
  // the plugin unloads. Fail-soft: any registration problem drops to scan.
  let disposeUnit: (() => void) | null = null
  try {
    disposeUnit = (ctx as Context & { sessionProjections: SessionProjectionRegistry }).sessionProjections.register(
      // Desktop harness register() reads stateSchema + wire; npm rc.6 d.ts still wants schema + view.
      usagePanelProjectionDefinition as never,
    )
  } catch (err) {
    console.warn(tag, 'projection registration failed; falling back to full scan:', String((err as Error)?.message ?? err))
    disposeUnit = null
    mode = 'scan'
  }

  let providerNames: Record<string, string> = {}
  if (llm && typeof llm.listProviders === 'function') {
    Promise.resolve(llm.listProviders())
      .then((infos) => {
        providerNames = Object.fromEntries((infos || []).map((p) => [p.id, p.name]))
      })
      .catch((err) => console.warn(tag, 'listProviders failed:', String((err as Error)?.message ?? err)))
  }

  let cache: { at: number; payload: Overview } | null = null
  let inflight: Promise<Overview> | null = null
  let disposed = false

  function logFailure(message: string): void {
    console.warn(tag, message)
  }

  async function scanProjection(now: number): Promise<Overview> {
    let a = emptyAggregate()
    let sessionsTotal = 0
    let sessionsOk = 0
    let sessionsFailed = 0
    let sessionsPending = 0
    const failures: string[] = []
    let sessions: SessionRecord[] = []
    try {
      sessions = await sq.listSessions()
    } catch (err) {
      logFailure('listSessions failed: ' + String((err as Error)?.message ?? err))
      return emptyOverview(now)
    }
    for (const rec of sessions) {
      const header = rec && rec.header
      if (!header) {
        sessionsTotal += 1
        sessionsFailed += 1
        continue
      }
      const id = header.id
      sessionsTotal += 1
      if (!rec.persisted) {
        sessionsPending += 1
        continue
      }
      try {
        const snap = await projCache.coldSnapshot(id)
        const value = snap.values.usagePanel
        if (!value) {
          sessionsPending += 1 // cell not folded yet (no events / cold)
          continue
        }
        a = mergeSessionValue(a, value, id, now)
        sessionsOk += 1
      } catch (err) {
        sessionsFailed += 1
        if (failures.length < 3) failures.push(String((err as Error)?.message ?? err))
      }
    }
    if (failures.length > 0) {
      logFailure(sessionsFailed + ' session(s) failed to read (first ' + failures.length + '): ' + failures.join(' | '))
    }
    const titles = new Map<string, string | null>()
    await Promise.all(
      rankSessions(a.sessions, 10).map(async (s) => {
        try {
          const t = await sq.readTitle(s.id as SessionId)
          titles.set(s.id, t ? t.title : null)
        } catch {
          titles.set(s.id, null)
        }
      }),
    )
    return finalizeOverview({
      aggregate: a,
      now,
      mode: 'projection',
      sessionsTotal,
      sessionsOk,
      sessionsFailed,
      sessionsPending,
      eventsCounted: 0,
      titles,
      providerNames,
    })
  }

  async function scan(now: number): Promise<Overview> {
    if (disposed) return cache ? cache.payload : emptyOverview(now)
    if (mode === 'projection') return scanProjection(now)
    return scanFallback({ sq, providerNames, logFailure }, now)
  }

  function startScan(): Promise<Overview> {
    if (disposed) return Promise.resolve(cache ? cache.payload : emptyOverview(Date.now()))
    if (inflight) return inflight
    const run = scan(Date.now()).then((payload) => {
      if (!disposed) cache = { at: Date.now(), payload }
      return payload
    })
    inflight = run
    run.catch(() => {}).then(() => {
      if (inflight === run) inflight = null
    })
    return run
  }

  function overview(args: { force?: boolean } | undefined): Promise<Overview> {
    const force = !!(args && args.force)
    if (!force && cache) {
      if (Date.now() - cache.at < STALE_MS) return Promise.resolve(cache.payload)
      startScan() // stale-while-revalidate: background refresh
      return Promise.resolve(Object.assign({}, cache.payload, { stale: true }))
    }
    return startScan()
  }

  // RPC channel for the browser half: /usage-stats/overview.
  const disposeRpc =
    connection &&
    connection.rpc.handle(
      RPC_CHANNEL,
      (endpoint, payload): Promise<RpcResult<Overview>> => {
        if (endpoint === RPC_OVERVIEW) {
          return overview(payload as { force?: boolean } | undefined).then(
            (value) => ({ ok: true, value }),
            (err) => ({
              ok: false,
              error: {
                code: 'internal',
                message: String((err as Error)?.message ?? err),
                details: {},
              },
            }),
          )
        }
        return Promise.resolve({
          ok: false,
          error: { code: 'bad-request', message: 'unknown endpoint: ' + String(endpoint), details: { issues: [] } },
        })
      },
      { authority: 'loopback' },
    )

  // Warm up the moment the plugin loads.
  startScan().then((o) => {
    console.log(
      tag,
      'first scan done:',
      'mode=' + o.coverage.mode,
      'sessions=' + o.coverage.sessionsTotal + '/' + o.coverage.sessionsOk + ' (failed ' + o.coverage.sessionsFailed + ', pending ' + o.coverage.sessionsPending + ')',
      'withUsage=' + o.allTime.sessionCount,
      'dataRange=' + (o.coverage.from === null ? '-' : new Date(o.coverage.from).toISOString()) + '..' + (o.coverage.to === null ? '-' : new Date(o.coverage.to).toISOString()),
    )
  })

  // Keep-warm: light periodic rescan so the cached payload never goes stale.
  const stopTimer = ctx.interval(() => {
    if (!inflight) startScan()
  }, RESCAN_MS)

  ctx.effect(() => () => {
    disposed = true
    if (disposeUnit) disposeUnit()
    if (stopTimer) stopTimer()
    if (disposeRpc) disposeRpc()
  })
}
