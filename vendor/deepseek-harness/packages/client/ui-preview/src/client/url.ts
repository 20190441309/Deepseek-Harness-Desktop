/** Local preview URL helpers (bare host → http, trim only). */

const BARE_LOOPBACK = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/.*)?$/i

/**
 * Normalize a typed or pasted local preview URL.
 * Bare loopback hosts (e.g. `localhost:5173`) become `http://…`.
 * Empty input stays empty so the caller can no-op.
 * @param raw - user-typed URL text.
 * @returns normalized URL text (may still be rejected by main IPC).
 */
export function normalizeLocalPreviewUrl(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return ''
  if (trimmed.includes('://')) return trimmed
  if (BARE_LOOPBACK.test(trimmed)) return `http://${trimmed}`
  return trimmed
}
