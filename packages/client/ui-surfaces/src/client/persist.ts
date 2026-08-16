/** Session-scoped surfaces tab persistence in localStorage. */

import type { SessionSurfaces, Surface, SurfacesState } from './stores.ts'

/** localStorage key prefix; the session id is the suffix. */
export const SURFACES_PERSIST_PREFIX = 'dsh-surfaces:v1:'

const WRITE_DELAY_MS = 80

const timers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Cancel a pending debounced write for one session.
 * @param sessionId - store key.
 */
export function cancelPersist(sessionId: string): void {
  const existing = timers.get(sessionId)
  if (existing === undefined) return
  clearTimeout(existing)
  timers.delete(sessionId)
}

/**
 * Load every persisted session bucket, dropping unknown kinds and malformed rows.
 * @param storage - `localStorage` in the browser; injectable in tests.
 * @returns a SurfacesState with only sanitized buckets.
 */
export function loadPersistedState(storage: Storage | undefined = typeof globalThis.localStorage === 'undefined' ? undefined : localStorage): SurfacesState {
  if (storage === undefined) return { bySession: {} }
  const bySession: SurfacesState['bySession'] = {}
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (key === null || !key.startsWith(SURFACES_PERSIST_PREFIX)) continue
    const sessionId = key.slice(SURFACES_PERSIST_PREFIX.length)
    if (sessionId.length === 0) continue
    const bucket = readBucket(storage.getItem(key))
    if (bucket !== undefined) bySession[sessionId] = bucket
  }
  return { bySession }
}

/**
 * Debounced write of one session bucket. An empty list removes the key.
 * @param sessionId - store key.
 * @param bucket - live surfaces for that session.
 * @param storage - `localStorage` in the browser; injectable in tests.
 */
export function persistSession(
  sessionId: string,
  bucket: SessionSurfaces,
  storage: Storage | undefined = typeof globalThis.localStorage === 'undefined' ? undefined : localStorage,
): void {
  if (storage === undefined) return
  if (sessionId.length === 0) return
  const existing = timers.get(sessionId)
  if (existing !== undefined) clearTimeout(existing)
  timers.set(sessionId, setTimeout(() => {
    timers.delete(sessionId)
    writeSession(sessionId, bucket, storage)
  }, WRITE_DELAY_MS))
}

/**
 * Write one session bucket immediately (tests and flush).
 * @param sessionId - store key.
 * @param bucket - live surfaces for that session.
 * @param storage - target storage.
 */
export function writeSession(
  sessionId: string,
  bucket: SessionSurfaces,
  storage: Storage | undefined = typeof globalThis.localStorage === 'undefined' ? undefined : localStorage,
): void {
  if (storage === undefined) return
  const key = `${SURFACES_PERSIST_PREFIX}${sessionId}`
  if (bucket.surfaces.length === 0) {
    storage.removeItem(key)
    return
  }
  storage.setItem(key, JSON.stringify({
    activeId: bucket.activeId,
    surfaces: bucket.surfaces,
  }))
}

/**
 * Parse and sanitize one stored bucket.
 * @param raw - JSON text, or null when the key is missing.
 * @returns a valid bucket, or undefined to drop the key.
 */
export function readBucket(raw: string | null): SessionSurfaces | undefined {
  if (raw === null || raw.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object') return undefined
  const record = parsed as { activeId?: unknown; surfaces?: unknown }
  if (!Array.isArray(record.surfaces)) return undefined
  const surfaces: Surface[] = []
  for (const entry of record.surfaces) {
    const surface = sanitizeSurface(entry)
    if (surface !== undefined) surfaces.push(surface)
  }
  const first = surfaces[0]
  if (first === undefined) return undefined
  const activeId = typeof record.activeId === 'string' && surfaces.some(surface => surface.id === record.activeId)
    ? record.activeId
    : first.id
  return { activeId, surfaces }
}

function sanitizeSurface(raw: unknown): Surface | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const entry = raw as { id?: unknown; kind?: unknown }
  if (typeof entry.id !== 'string' || typeof entry.kind !== 'string') return undefined
  switch (entry.kind) {
    case 'files':
      return entry.id === 'files' ? { id: 'files', kind: 'files' } : undefined
    case 'diff':
      return entry.id === 'diff' ? { id: 'diff', kind: 'diff' } : undefined
    case 'agents':
      return entry.id === 'agents' ? { id: 'agents', kind: 'agents' } : undefined
    case 'preview': {
      const resourceId = 'resourceId' in entry && typeof (entry as { resourceId: unknown }).resourceId === 'string'
        ? (entry as { resourceId: string }).resourceId
        : null
      return { id: entry.id, kind: 'preview', resourceId }
    }
    case 'terminal': {
      const extra = entry as { terminalIds?: unknown; activeTerminalId?: unknown }
      const terminalIds = Array.isArray(extra.terminalIds)
        ? extra.terminalIds.filter((id): id is string => typeof id === 'string')
        : []
      const activeTerminalId = typeof extra.activeTerminalId === 'string' ? extra.activeTerminalId : ''
      return { id: entry.id, kind: 'terminal', terminalIds, activeTerminalId }
    }
    case 'file': {
      const relativePath = (entry as { relativePath?: unknown }).relativePath
      if (typeof relativePath !== 'string' || relativePath.length === 0) return undefined
      return { id: entry.id, kind: 'file', relativePath }
    }
    default:
      return undefined
  }
}
