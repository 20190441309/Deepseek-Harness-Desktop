export type ChatRole = 'user' | 'assistant' | 'tool'

export type ChatMessage = {
  id: string
  role: ChatRole
  text: string
  seq: number
}

type HistoryEntry = {
  event?: SessionEvent
}

type SessionEvent = {
  type?: string
  seq?: number
  data?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function blocksText(blocks: unknown): string {
  if (!Array.isArray(blocks)) {
    return ''
  }
  return blocks.map((block) => {
    const row = asRecord(block)
    if (!row) {
      return ''
    }
    if (typeof row.text === 'string') {
      return row.text
    }
    if (Array.isArray(row.content)) {
      return blocksText(row.content)
    }
    return ''
  }).join('')
}

export function eventText(data: unknown): string {
  const row = asRecord(data)
  if (!row) {
    return ''
  }
  if (Array.isArray(row.content)) {
    return blocksText(row.content)
  }
  if (row.message) {
    return eventText(row.message)
  }
  return ''
}

function entryEvent(entry: HistoryEntry | SessionEvent): SessionEvent {
  if ('event' in entry && entry.event) {
    return entry.event
  }
  return entry as SessionEvent
}

/** Fold history / live session events into portrait chat bubbles. */
export function foldEvents(entries: unknown[]): ChatMessage[] {
  const out: ChatMessage[] = []
  let stream: ChatMessage | null = null

  const push = (role: ChatRole, text: string, seq: number): void => {
    if (!text.trim() && role !== 'assistant') {
      return
    }
    out.push({ id: `${role}-${seq}-${out.length}`, role, text, seq })
  }

  for (const raw of entries) {
    const event = entryEvent(raw as HistoryEntry | SessionEvent)
    const seq = typeof event.seq === 'number' ? event.seq : out.length
    const data = asRecord(event.data)
    if (event.type === 'user/message') {
      stream = null
      push('user', eventText(event.data), seq)
      continue
    }
    if (event.type === 'assistant/message') {
      const text = eventText(event.data)
      if (stream) {
        stream.text = text || stream.text
        stream.seq = seq
        stream = null
        continue
      }
      push('assistant', text, seq)
      continue
    }
    if (event.type === 'assistant/chunk') {
      const chunk = asRecord(data?.chunk)
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
        if (!stream) {
          stream = { id: `assistant-stream-${seq}`, role: 'assistant', text: '', seq }
          out.push(stream)
        }
        stream.text += chunk.text
        stream.seq = seq
      }
      continue
    }
    if (event.type === 'tool/call') {
      stream = null
      const name = typeof data?.name === 'string' ? data.name : '工具'
      push('tool', name, seq)
    }
  }
  return out
}

export function sessionTitle(item: {
  sessionId: string
  cwd?: string
  projections?: { values?: Record<string, unknown> }
}): string {
  const title = item.projections?.values?.title
  if (typeof title === 'string' && title.trim()) {
    return title
  }
  const cwd = item.cwd || ''
  const base = cwd.replace(/[/\\]+$/, '').split(/[/\\]/).pop()
  if (base) {
    return base
  }
  return item.sessionId
}

import type { Lang } from '../locale.ts'
import { copy } from '../locale.ts'

export function relativeTime(updatedAt: number, now = Date.now(), lang: Lang = 'zh'): string {
  const t = copy[lang]
  const delta = Math.max(0, now - updatedAt)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (delta < minute) {
    return t.justNow
  }
  if (delta < hour) {
    return t.minutesAgo(Math.floor(delta / minute))
  }
  if (delta < day) {
    return t.hoursAgo(Math.floor(delta / hour))
  }
  return t.daysAgo(Math.floor(delta / day))
}
