// @vitest-environment jsdom
/** Vision-model picker lists only catalog rows that advertise image input. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RpcResponse, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { VISION_FALLBACK_NS, VisionModelPicker } from '../src/client/VisionModelPicker.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

let nextRpc = 0
function ok<T>(value: T): RpcResponse<T> {
  return { rpcId: `r-${nextRpc++}` as never, result: { ok: true, value } }
}

function namespace(value: Record<string, string> = {}): SettingsNamespaceView {
  return {
    ns: VISION_FALLBACK_NS,
    schema: {},
    value,
    applies: 'live',
    secrets: [],
    revision: 0,
  }
}

function fail<T>(message: string, code = 'settings-rejected'): RpcResponse<T> {
  return {
    rpcId: `r-${nextRpc++}` as never,
    result: { ok: false, error: { code, message, details: { ns: 'x' } } as never },
  }
}

const IMAGE_GROUPS = [{
  id: 'codingplan',
  name: 'Codingplan',
  models: [
    { id: 'doubao-seed', name: 'Doubao Seed', inputModalities: ['text', 'image'] as const },
    { id: 'glm-5.3', name: 'GLM 5.3', inputModalities: ['text'] as const },
    { id: 'bare', name: 'Bare' },
  ],
}]

function mount(options: {
  groups?: typeof IMAGE_GROUPS
  stored?: Record<string, string>
  namespace?: SettingsNamespaceView | undefined
  writable?: boolean
  models?: ReturnType<typeof vi.fn>
  mutate?: ReturnType<typeof vi.fn>
  onSaved?: () => void
} = {}) {
  const models = options.models ?? vi.fn(() => Promise.resolve(ok({
    groups: options.groups ?? IMAGE_GROUPS,
    failures: [],
  })))
  const mutate = options.mutate ?? vi.fn(() => Promise.resolve(ok({})))
  const onSaved = options.onSaved ?? (() => {})
  const view = render(
    <VisionModelPicker
      api={{ llm: { models }, settings: { mutate } } as never}
      t={key => en[key]}
      namespace={'namespace' in options ? options.namespace : namespace(options.stored)}
      writable={options.writable ?? true}
      onSaved={onSaved}
    />,
  )
  return { ...view, models, mutate, onSaved }
}

describe('VisionModelPicker', () => {
  it('lists only models that advertise image input', async () => {
    mount()

    expect(await screen.findByRole('option', { name: 'Codingplan / Doubao Seed' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Codingplan / GLM 5.3' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Codingplan / Bare' })).toBeNull()
    expect(screen.getByRole('option', { name: en.visionModelOff })).toBeTruthy()
  })

  it('hides itself while the vision-fallback namespace is absent', () => {
    mount({ namespace: undefined })
    expect(screen.queryByLabelText(en.visionModel)).toBeNull()
  })

  it('keeps a stored text-only route visible instead of snapping to off', async () => {
    mount({ stored: { provider: 'codingplan', model: 'glm-5.3' } })

    const select = await screen.findByLabelText(en.visionModel) as HTMLSelectElement
    expect(await screen.findByRole('option', { name: 'codingplan / glm-5.3' })).toBeTruthy()
    expect(select.value).toBe('codingplan\nglm-5.3')
  })

  it('treats a half-stored route as off', async () => {
    mount({ stored: { provider: 'codingplan' } })
    const select = await screen.findByLabelText(en.visionModel) as HTMLSelectElement
    await screen.findByRole('option', { name: 'Codingplan / Doubao Seed' })
    expect(select.value).toBe('')
    expect(screen.queryByRole('option', { name: 'codingplan /' })).toBeNull()
  })

  it('persists a selected image-capable route', async () => {
    const { mutate, onSaved } = mount({ onSaved: vi.fn() })
    await screen.findByRole('option', { name: 'Codingplan / Doubao Seed' })
    fireEvent.change(screen.getByLabelText(en.visionModel), { target: { value: 'codingplan\ndoubao-seed' } })
    await waitFor(() => { expect(mutate).toHaveBeenCalledOnce() })
    expect(mutate.mock.calls[0]?.[0]).toEqual({
      ns: VISION_FALLBACK_NS,
      ops: [
        { op: 'set', path: ['provider'], value: 'codingplan' },
        { op: 'set', path: ['model'], value: 'doubao-seed' },
      ],
      expectedRevision: 0,
    })
    expect(onSaved).toHaveBeenCalledOnce()
  })

  it('clears the stored route when the picker is turned off', async () => {
    const { mutate } = mount({ stored: { provider: 'codingplan', model: 'doubao-seed' } })
    await screen.findByRole('option', { name: 'Codingplan / Doubao Seed' })
    fireEvent.change(screen.getByLabelText(en.visionModel), { target: { value: '' } })
    await waitFor(() => { expect(mutate).toHaveBeenCalledOnce() })
    expect(mutate.mock.calls[0]?.[0]).toEqual({
      ns: VISION_FALLBACK_NS,
      ops: [
        { op: 'unset', path: ['provider'] },
        { op: 'unset', path: ['model'] },
      ],
      expectedRevision: 0,
    })
  })

  it('reports a catalog load failure', async () => {
    mount({ models: vi.fn(() => Promise.resolve(fail('catalog offline'))) })
    expect(await screen.findByText(`${en.visionModelLoadFailed}: catalog offline`)).toBeTruthy()
  })

  it('reports a catalog load transport rejection', async () => {
    mount({ models: vi.fn(() => Promise.reject(new Error('connection lost'))) })
    expect(await screen.findByText(`${en.visionModelLoadFailed}: connection lost`)).toBeTruthy()
  })

  it('reports a save failure without acknowledging', async () => {
    const { onSaved } = mount({
      mutate: vi.fn(() => Promise.resolve(fail('revision conflict'))),
      onSaved: vi.fn(),
    })
    await screen.findByRole('option', { name: 'Codingplan / Doubao Seed' })
    fireEvent.change(screen.getByLabelText(en.visionModel), { target: { value: 'codingplan\ndoubao-seed' } })
    expect(await screen.findByText(`${en.visionModelSaveFailed}: revision conflict`)).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('reports a save transport rejection', async () => {
    mount({ mutate: vi.fn(() => Promise.reject(new Error('connection lost'))) })
    await screen.findByRole('option', { name: 'Codingplan / Doubao Seed' })
    fireEvent.change(screen.getByLabelText(en.visionModel), { target: { value: 'codingplan\ndoubao-seed' } })
    expect(await screen.findByText(`${en.visionModelSaveFailed}: connection lost`)).toBeTruthy()
  })

  it('disables the control while the document is read-only', async () => {
    mount({ writable: false })
    expect((await screen.findByLabelText(en.visionModel) as HTMLSelectElement).disabled).toBe(true)
  })

  it('ignores a catalog reply that lands after unmount', async () => {
    const pending = Promise.withResolvers<RpcResponse<{ groups: typeof IMAGE_GROUPS; failures: never[] }>>()
    const { unmount } = mount({ models: vi.fn(() => pending.promise) })
    unmount()
    pending.resolve(ok({ groups: IMAGE_GROUPS, failures: [] }))
    await Promise.resolve()
    expect(screen.queryByLabelText(en.visionModel)).toBeNull()
  })

  it('ignores a catalog rejection that lands after unmount', async () => {
    const pending = Promise.withResolvers<RpcResponse<{ groups: typeof IMAGE_GROUPS; failures: never[] }>>()
    const { unmount } = mount({ models: vi.fn(() => pending.promise) })
    unmount()
    pending.reject(new Error('connection lost'))
    await Promise.resolve()
    expect(screen.queryByLabelText(en.visionModel)).toBeNull()
  })
})
