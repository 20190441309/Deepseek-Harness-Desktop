import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientSessionContext, InputTriggerPick } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { createPathTriggerSource } from '../src/client/pathTrigger.ts'
import type { ListDirResult } from '../src/client/shell.ts'

const session: ClientSessionContext = { sessionId: 's1' as SessionId }

function sessionsWith(cwd: string | undefined, extra?: { agentPreset?: string }) {
  return {
    list: {
      getSnapshot: () => ({
        byId: {
          [session.sessionId]: {
            ...(cwd === undefined ? {} : { cwd }),
            ...(extra?.agentPreset === undefined ? {} : { agentPreset: extra.agentPreset }),
          },
        },
      }),
    },
  }
}

async function srcTree(_cwd: string, relativePath: string): Promise<ListDirResult> {
  if (relativePath === '') {
    return { ok: true, entries: [{ name: 'src', kind: 'directory' }] }
  }
  if (relativePath === 'src') {
    return { ok: true, entries: [{ name: 'a.ts', kind: 'file' }] }
  }
  return { ok: true, entries: [] }
}

function request(query: string, signal = new AbortController().signal) {
  return { query, position: 'inline' as const, signal }
}

function pickOf(name: string): InputTriggerPick {
  return {
    candidate: { name },
    session,
    position: 'inline',
    via: 'menu',
    span: { start: 0, end: 4, draftRev: 1 },
  }
}

describe('createPathTriggerSource', () => {
  it('registers as the @ path source after subagent', () => {
    const source = createPathTriggerSource({ sessions: sessionsWith('/tmp/proj'), listDir: srcTree })
    expect(source.trigger).toBe('@')
    expect(source.name).toBe('path')
    expect(source.order).toBe(1)
    expect(source.lexicon).toBeUndefined()
    expect(source.codec).toBeUndefined()
  })

  it('offers the relative path for query src and inserts a markdown file link', async () => {
    const source = createPathTriggerSource({ sessions: sessionsWith('/tmp/proj'), listDir: srcTree })
    const candidates = await source.candidates(session, request('src'))
    expect(candidates.map(row => row.name)).toContain('src/a.ts')
    expect(candidates.find(row => row.name === 'src/a.ts')?.description).toBe('a.ts')
    expect(source.onPick(pickOf('src/a.ts'))).toEqual({ text: '[a.ts](src/a.ts) ' })
  })

  it('returns no candidates when the session cwd is missing', async () => {
    const listDir = vi.fn(srcTree)
    const source = createPathTriggerSource({ sessions: sessionsWith(undefined), listDir })
    await expect(source.candidates(session, request('src'))).resolves.toEqual([])
    expect(listDir).not.toHaveBeenCalled()
  })

  it('returns no candidates when the request is already aborted', async () => {
    const listDir = vi.fn(srcTree)
    const source = createPathTriggerSource({ sessions: sessionsWith('/tmp/proj'), listDir })
    const controller = new AbortController()
    controller.abort()
    await expect(source.candidates(session, request('src', controller.signal))).resolves.toEqual([])
    expect(listDir).not.toHaveBeenCalled()
  })

  it('returns no candidates when listDir is not ok', async () => {
    const source = createPathTriggerSource({
      sessions: sessionsWith('/tmp/proj'),
      listDir: async () => ({ ok: false, message: 'denied' }),
    })
    await expect(source.candidates(session, request('src'))).resolves.toEqual([])
  })

  it('returns no candidates when the session cwd is empty', async () => {
    const listDir = vi.fn(srcTree)
    const source = createPathTriggerSource({ sessions: sessionsWith(''), listDir })
    await expect(source.candidates(session, request('src'))).resolves.toEqual([])
    expect(listDir).not.toHaveBeenCalled()
  })

  it('returns no candidates in a dshbot-room session', async () => {
    const listDir = vi.fn(srcTree)
    const source = createPathTriggerSource({
      sessions: sessionsWith('/tmp/proj', { agentPreset: 'dshbot-room' }),
      listDir,
    })
    await expect(source.candidates(session, request('src'))).resolves.toEqual([])
    expect(listDir).not.toHaveBeenCalled()
  })

  it('returns no candidates when listing omits entries', async () => {
    const source = createPathTriggerSource({
      sessions: sessionsWith('/tmp/proj'),
      listDir: async () => ({ ok: true }),
    })
    await expect(source.candidates(session, request('src'))).resolves.toEqual([])
  })

  it('stops the walk when the signal aborts after a nested listing', async () => {
    const controller = new AbortController()
    const listDir: typeof srcTree = async (_cwd, relativePath) => {
      if (relativePath === 'a') {
        controller.abort()
        return { ok: true, entries: [{ name: 'x.ts', kind: 'file' }] }
      }
      if (relativePath === '') {
        return {
          ok: true,
          entries: [
            { name: 'keep.ts', kind: 'file' },
            { name: 'a', kind: 'directory' },
            { name: 'b', kind: 'directory' },
          ],
        }
      }
      return { ok: true, entries: [{ name: 'y.ts', kind: 'file' }] }
    }
    const source = createPathTriggerSource({ sessions: sessionsWith('/tmp/proj'), listDir })
    await expect(source.candidates(session, request('x', controller.signal))).resolves.toEqual([])
  })
})
