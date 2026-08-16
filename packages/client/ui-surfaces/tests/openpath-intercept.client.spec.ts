/**
 * wrapOpenPath: takeover, fallthrough, disposer restore, wrapper chain.
 */
import { describe, expect, it, vi } from 'vitest'
import { wrapOpenPath } from '../src/client/openpath-intercept.ts'

function service(openPath: (path: string) => Promise<void>) {
  return { openPath }
}

describe('wrapOpenPath', () => {
  it('takes over when enabled with a current session and openInSurfaces accepts', async () => {
    const original = vi.fn(async () => {})
    const openInSurfaces = vi.fn(() => true)
    const workspaces = service(original)
    wrapOpenPath(workspaces, {
      takeoverEnabled: () => true,
      currentSessionId: () => 'sess-1',
      openInSurfaces,
    })
    await workspaces.openPath('/tmp/proj/a.ts')
    expect(openInSurfaces).toHaveBeenCalledWith('/tmp/proj/a.ts', 'sess-1')
    expect(original).not.toHaveBeenCalled()
  })

  it('falls through without a current session', async () => {
    const original = vi.fn(async () => {})
    const workspaces = service(original)
    wrapOpenPath(workspaces, {
      takeoverEnabled: () => true,
      currentSessionId: () => undefined,
      openInSurfaces: () => true,
    })
    await workspaces.openPath('/tmp/proj/a.ts')
    expect(original).toHaveBeenCalledWith('/tmp/proj/a.ts')
  })

  it('falls through when takeover is disabled', async () => {
    const original = vi.fn(async () => {})
    const workspaces = service(original)
    wrapOpenPath(workspaces, {
      takeoverEnabled: () => false,
      currentSessionId: () => 'sess-1',
      openInSurfaces: () => true,
    })
    await workspaces.openPath('/tmp/proj/a.ts')
    expect(original).toHaveBeenCalledOnce()
  })

  it('falls through when openInSurfaces rejects the path', async () => {
    const original = vi.fn(async () => {})
    const workspaces = service(original)
    wrapOpenPath(workspaces, {
      takeoverEnabled: () => true,
      currentSessionId: () => 'sess-1',
      openInSurfaces: () => false,
    })
    await workspaces.openPath('/outside/a.ts')
    expect(original).toHaveBeenCalledWith('/outside/a.ts')
  })

  it('restores the original function reference on dispose', async () => {
    const original = vi.fn(async () => {})
    const workspaces = service(original)
    const dispose = wrapOpenPath(workspaces, {
      takeoverEnabled: () => true,
      currentSessionId: () => 'sess-1',
      openInSurfaces: () => true,
    })
    expect(workspaces.openPath).not.toBe(original)
    dispose()
    expect(workspaces.openPath).toBe(original)
    await workspaces.openPath('/tmp/proj/a.ts')
    expect(original).toHaveBeenCalledOnce()
  })

  it('unwinds a wrapper chain from the top without restoring a bind copy', async () => {
    const original = vi.fn(async () => {})
    const workspaces = service(original)
    const inner = wrapOpenPath(workspaces, {
      takeoverEnabled: () => true,
      currentSessionId: () => 'sess-1',
      openInSurfaces: () => true,
    })
    const innerFn = workspaces.openPath
    const outerOpened = vi.fn(() => true)
    const outer = wrapOpenPath(workspaces, {
      takeoverEnabled: () => true,
      currentSessionId: () => 'sess-1',
      openInSurfaces: outerOpened,
    })
    await workspaces.openPath('/tmp/a.ts')
    expect(outerOpened).toHaveBeenCalledOnce()
    outer()
    expect(workspaces.openPath).toBe(innerFn)
    inner()
    expect(workspaces.openPath).toBe(original)
  })

  it('leaves a later wrapper in place when an inner disposer runs first', async () => {
    const original = vi.fn(async () => {})
    const workspaces = service(original)
    const innerOpened = vi.fn(() => true)
    const inner = wrapOpenPath(workspaces, {
      takeoverEnabled: () => true,
      currentSessionId: () => 'sess-1',
      openInSurfaces: innerOpened,
    })
    const outerOpened = vi.fn(() => true)
    wrapOpenPath(workspaces, {
      takeoverEnabled: () => true,
      currentSessionId: () => 'sess-1',
      openInSurfaces: outerOpened,
    })
    inner()
    await workspaces.openPath('/tmp/a.ts')
    expect(outerOpened).toHaveBeenCalledOnce()
    expect(innerOpened).not.toHaveBeenCalled()
    expect(workspaces.openPath).not.toBe(original)
  })
})
