// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import type { GeneralSectionComponentProps } from '../src/client/GeneralSection.tsx'
import { GeneralSection } from '../src/client/GeneralSection.tsx'
import { CloseLabel, HeaderContent, TriggerContent } from '../src/client/chrome.tsx'
import type { TriggerContentProps } from '../src/client/chrome.tsx'
import { SettingsDocumentAction } from '../src/client/SettingsDocumentAction.tsx'
import { SettingsDocumentStore } from '../src/client/settings-document-store.ts'
import { HarnessRestartRow } from '../src/client/HarnessRestartRow.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

// The seat's key domain is settings ∪ common; the stub answers from the
// package dictionary, interpolates `{name}` params like the real locale chain,
// and falls back to the key.
const t: TriggerContentProps['t'] = (key, params) => {
  const text = (en as Record<string, string>)[key] ?? key
  if (params === undefined) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match)
}

// Global standard kit stubs: none of these components consume the hooks.
const unusedHook = (() => { throw new Error('unused by settings-general components') }) as never
const kit = { useSessions: unusedHook, useWorkspaces: unusedHook }

describe('chrome content', () => {
  it('TriggerContent renders the icon with the label in the wide column', () => {
    const { container } = render(<TriggerContent {...kit} wide t={t} />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('TriggerContent drops the label in the rail state', () => {
    const { container } = render(<TriggerContent {...kit} wide={false} t={t} />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.queryByText('Settings')).toBeNull()
  })

  it('HeaderContent and CloseLabel render their translated text', () => {
    render(<HeaderContent {...kit} t={t} />)
    render(<CloseLabel {...kit} t={t} />)
    expect(screen.getByText('Settings')).toBeTruthy()
    expect(screen.getByText('Close')).toBeTruthy()
  })
})

describe('GeneralSection', () => {
  function mount() {
    const renderSlot = vi.fn(
      ((key: string) => <div data-testid={`slot-${key}`} />) as GeneralSectionComponentProps['renderSlot'],
    )
    const props: GeneralSectionComponentProps = { ...kit, renderSlot, close: vi.fn() }
    const view = render(<GeneralSection {...props} />)
    return { view, renderSlot }
  }

  it('renders the item slot as the section body', () => {
    const { renderSlot } = mount()
    expect(renderSlot).toHaveBeenCalledWith('settings.general.item', {})
    expect(screen.getByTestId('slot-settings.general.item')).toBeTruthy()
  })
})

describe('HarnessRestartRow', () => {
  afterEach(() => {
    delete (window as Window & { shell?: unknown }).shell
  })

  /** A promise the test settles explicitly, so async phases are observable. */
  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  }

  it('stays inert while no desktop bridge is present', () => {
    render(<HarnessRestartRow {...kit} t={t} />)
    // Registration already gates on the bridge; a shell that vanished after
    // registration must degrade to the reading state with locked controls.
    expect(screen.getByRole('status').textContent).toBe(en['harnessRestart.loading'])
    expect(screen.getByRole('switch', { name: en['harnessRestart.enable'] })).toHaveProperty('disabled', true)
  })

  it('loads the persisted policy and renders the switch and selectors', async () => {
    const pending = deferred<{ harnessAutoRestart: boolean; harnessRestartMaxAttempts: number; harnessRestartBaseDelayMs: number }>()
    const getConfig = vi.fn(() => pending.promise)
    ;(window as Window & { shell?: unknown }).shell = { getConfig, saveConfig: vi.fn() }
    render(<HarnessRestartRow {...kit} t={t} />)
    // Reading state is announced while the bridge answers.
    expect(screen.getByRole('status').textContent).toBe(en['harnessRestart.loading'])
    expect(screen.getByRole('switch', { name: en['harnessRestart.enable'] })).toHaveProperty('disabled', true)

    pending.resolve({ harnessAutoRestart: true, harnessRestartMaxAttempts: 5, harnessRestartBaseDelayMs: 5000 })
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: en['harnessRestart.enable'] })).toHaveProperty('checked', true)
    })
    expect(getConfig).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: en['harnessRestart.maxAttempts'] }).textContent).toContain('5')
    expect(screen.getByRole('button', { name: en['harnessRestart.baseDelay'] }).textContent).toContain('5s')
  })

  it('normalizes an absent persisted policy to the product defaults', async () => {
    ;(window as Window & { shell?: unknown }).shell = { getConfig: vi.fn(async () => ({})), saveConfig: vi.fn() }
    render(<HarnessRestartRow {...kit} t={t} />)
    const toggle = screen.getByRole('switch', { name: en['harnessRestart.enable'] })
    await waitFor(() => { expect(toggle).not.toHaveProperty('disabled', true) })
    expect(toggle).toHaveProperty('checked', true)
    expect(screen.getByRole('button', { name: en['harnessRestart.maxAttempts'] }).textContent).toContain('3')
    expect(screen.getByRole('button', { name: en['harnessRestart.baseDelay'] }).textContent).toContain('1s')
  })

  it('reports a failed load with the localized copy', async () => {
    const getConfig = vi.fn(async () => { throw new Error('bridge down') })
    ;(window as Window & { shell?: unknown }).shell = { getConfig, saveConfig: vi.fn() }
    render(<HarnessRestartRow {...kit} t={t} />)
    expect((await screen.findByRole('alert')).textContent).toBe('Failed to read or save settings: bridge down')
  })

  it('renders a non-Error failure message', async () => {
    const getConfig = vi.fn(async () => { throw 'bridge down' })
    const saveConfig = vi.fn(async () => { throw 'disk full' })
    ;(window as Window & { shell?: unknown }).shell = { getConfig, saveConfig }
    render(<HarnessRestartRow {...kit} t={t} />)
    expect((await screen.findByRole('alert')).textContent).toBe('Failed to read or save settings: bridge down')
    const toggle = screen.getByRole('switch', { name: en['harnessRestart.enable'] })
    await waitFor(() => { expect(toggle).not.toHaveProperty('disabled', true) })
    fireEvent.click(toggle)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('Failed to read or save settings: disk full')
    })
  })

  it('ignores bridge answers that settle after unmount', async () => {
    // A resolved read landing after teardown must not update state.
    const resolveCase = deferred<{ harnessAutoRestart?: boolean }>()
    ;(window as Window & { shell?: unknown }).shell = { getConfig: vi.fn(() => resolveCase.promise), saveConfig: vi.fn() }
    const view = render(<HarnessRestartRow {...kit} t={t} />)
    view.unmount()
    resolveCase.resolve({ harnessAutoRestart: true })
    await Promise.resolve()
    // A rejected read landing after teardown is swallowed the same way.
    const rejectCase = deferred<never>()
    ;(window as Window & { shell?: unknown }).shell = { getConfig: vi.fn(() => rejectCase.promise), saveConfig: vi.fn() }
    const second = render(<HarnessRestartRow {...kit} t={t} />)
    second.unmount()
    rejectCase.reject(new Error('late answer'))
    await Promise.resolve()
  })

  it('ignores a toggle when the bridge exposes no saveConfig', async () => {
    ;(window as Window & { shell?: unknown }).shell = { getConfig: vi.fn(async () => ({})) }
    render(<HarnessRestartRow {...kit} t={t} />)
    const toggle = screen.getByRole('switch', { name: en['harnessRestart.enable'] })
    await waitFor(() => { expect(toggle).not.toHaveProperty('disabled', true) })
    fireEvent.click(toggle)
    // No write direction: the gesture is ignored rather than failing.
    expect(screen.queryByRole('status')).toBeNull()
    expect(toggle).toHaveProperty('checked', true)
  })

  it('closes both menus on an outside dismissal', async () => {
    ;(window as Window & { shell?: unknown }).shell = {
      getConfig: vi.fn(async () => ({ harnessRestartMaxAttempts: 3, harnessRestartBaseDelayMs: 2000 })),
      saveConfig: vi.fn(),
    }
    render(<HarnessRestartRow {...kit} t={t} />)
    const attempts = screen.getByRole('button', { name: en['harnessRestart.maxAttempts'] })
    const delay = screen.getByRole('button', { name: en['harnessRestart.baseDelay'] })
    await waitFor(() => { expect(attempts).not.toHaveProperty('disabled', true) })

    fireEvent.click(attempts)
    expect(attempts.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(attempts.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(delay)
    expect(delay.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(delay.getAttribute('aria-expanded')).toBe('false')
  })

  it('persists a toggle and applies the returned normalized policy', async () => {
    const getConfig = vi.fn(async () => ({ harnessAutoRestart: false, harnessRestartMaxAttempts: 1, harnessRestartBaseDelayMs: 1000 }))
    const pending = deferred<{ harnessAutoRestart?: boolean }>()
    const saveConfig = vi.fn(() => pending.promise)
    ;(window as Window & { shell?: unknown }).shell = { getConfig, saveConfig }
    render(<HarnessRestartRow {...kit} t={t} />)
    const toggle = screen.getByRole('switch', { name: en['harnessRestart.enable'] })
    await waitFor(() => { expect(toggle).not.toHaveProperty('disabled', true) })
    expect(screen.getByRole('button', { name: en['harnessRestart.maxAttempts'] }).textContent).toContain('1')
    expect(screen.getByRole('button', { name: en['harnessRestart.baseDelay'] }).textContent).toContain('1s')

    fireEvent.click(toggle)
    // The write announces itself and locks the controls until the bridge answers.
    expect(screen.getByRole('status').textContent).toBe(en['harnessRestart.saving'])
    expect(screen.getByRole('switch', { name: en['harnessRestart.enable'] })).toHaveProperty('disabled', true)
    expect(saveConfig).toHaveBeenCalledWith({ harnessAutoRestart: true })

    // The echoed partial policy preserves fields the bridge omitted.
    pending.resolve({ harnessAutoRestart: true })
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: en['harnessRestart.enable'] })).toHaveProperty('checked', true)
    })
    expect(screen.getByRole('button', { name: en['harnessRestart.maxAttempts'] }).textContent).toContain('1')
    expect(screen.getByRole('button', { name: en['harnessRestart.baseDelay'] }).textContent).toContain('1s')
  })

  it('reports a failed save with the localized copy and stays usable', async () => {
    const saveConfig = vi.fn(async () => { throw new Error('disk full') })
    ;(window as Window & { shell?: unknown }).shell = { getConfig: vi.fn(async () => ({})), saveConfig }
    render(<HarnessRestartRow {...kit} t={t} />)
    const toggle = screen.getByRole('switch', { name: en['harnessRestart.enable'] })
    await waitFor(() => { expect(toggle).not.toHaveProperty('disabled', true) })
    fireEvent.click(toggle)
    expect((await screen.findByRole('alert')).textContent).toBe('Failed to read or save settings: disk full')
    expect(screen.getByRole('switch', { name: en['harnessRestart.enable'] })).not.toHaveProperty('disabled', true)
  })

  it('persists a max-attempts pick from its menu', async () => {
    const saveConfig = vi.fn(async () => ({ harnessRestartMaxAttempts: 1, harnessRestartBaseDelayMs: 2000 }))
    ;(window as Window & { shell?: unknown }).shell = {
      getConfig: vi.fn(async () => ({ harnessRestartMaxAttempts: 3, harnessRestartBaseDelayMs: 2000 })),
      saveConfig,
    }
    render(<HarnessRestartRow {...kit} t={t} />)
    const attempts = screen.getByRole('button', { name: en['harnessRestart.maxAttempts'] })
    await waitFor(() => { expect(attempts).not.toHaveProperty('disabled', true) })
    fireEvent.click(attempts)
    fireEvent.click(screen.getByRole('menuitem', { name: '1' }))
    expect(saveConfig).toHaveBeenCalledWith({ harnessRestartMaxAttempts: 1 })
  })

  it('persists a base-delay pick from its menu', async () => {
    const saveConfig = vi.fn(async () => ({ harnessRestartMaxAttempts: 3, harnessRestartBaseDelayMs: 5000 }))
    ;(window as Window & { shell?: unknown }).shell = {
      getConfig: vi.fn(async () => ({ harnessRestartMaxAttempts: 3, harnessRestartBaseDelayMs: 2000 })),
      saveConfig,
    }
    render(<HarnessRestartRow {...kit} t={t} />)
    const delay = screen.getByRole('button', { name: en['harnessRestart.baseDelay'] })
    await waitFor(() => { expect(delay).not.toHaveProperty('disabled', true) })
    fireEvent.click(delay)
    fireEvent.click(screen.getByRole('menuitem', { name: '5s' }))
    expect(saveConfig).toHaveBeenCalledWith({ harnessRestartBaseDelayMs: 5000 })
  })
})

describe('SettingsDocumentAction', () => {
  it('appears only for a file-backed provider and requests its Host-owned document', async () => {
    const openDocument = vi.fn(() => Promise.resolve({
      rpcId: 'document-open' as never,
      result: { ok: true as const, value: { opened: true as const } },
    }))
    const controller = new SettingsDocumentStore({
      settings: {
        describe: vi.fn(() => Promise.resolve({
          rpcId: 'document-action' as never,
          result: {
            ok: true as const,
            value: { writable: true, hasDocument: true, namespaces: [] },
          },
        })),
        openDocument,
      },
    } as never)
    render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    const action = await screen.findByRole('button', { name: 'Open configuration file' })
    fireEvent.click(action)
    await waitFor(() => { expect(openDocument).toHaveBeenCalledWith({}) })
  })

  it('stays absent without a document and retries availability after remount', async () => {
    const describe = vi.fn()
      .mockResolvedValueOnce({
        rpcId: 'document-action-absent' as never,
        result: { ok: true as const, value: { writable: true, hasDocument: false, namespaces: [] } },
      })
      .mockResolvedValueOnce({
        rpcId: 'document-action-ready' as never,
        result: { ok: true as const, value: { writable: true, hasDocument: true, namespaces: [] } },
      })
    const controller = new SettingsDocumentStore({
      settings: {
        describe,
        openDocument: vi.fn(),
      },
    } as never)
    const first = render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    await waitFor(() => { expect(controller.store.getSnapshot().status).toBe('unavailable') })
    expect(screen.queryByRole('button', { name: 'Open configuration file' })).toBeNull()
    first.unmount()
    render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    expect(await screen.findByRole('button', { name: 'Open configuration file' })).toBeTruthy()
    expect(describe).toHaveBeenCalledTimes(2)
  })

  it('keeps the action available and reports a native-open failure', async () => {
    const controller = new SettingsDocumentStore({
      settings: {
        describe: vi.fn(() => Promise.resolve({
          rpcId: 'document-action' as never,
          result: {
            ok: true as const,
            value: { writable: true, hasDocument: true, namespaces: [] },
          },
        })),
        openDocument: vi.fn(() => Promise.resolve({
          rpcId: 'document-open-failed' as never,
          result: { ok: false as const, error: { code: 'internal' as const, message: 'xdg-open missing', details: {} } },
        })),
      },
    } as never)
    render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open configuration file' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Could not open configuration file')
    expect(screen.getByRole('button', { name: 'Open configuration file' })).toBeTruthy()
  })
})
