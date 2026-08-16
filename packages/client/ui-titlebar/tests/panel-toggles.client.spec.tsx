// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { PanelTogglesProps } from '../src/client/PanelToggles.tsx'
import { PanelToggles } from '../src/client/PanelToggles.tsx'
import { en } from '../src/client/locales.ts'

const t: PanelTogglesProps['t'] = key => (en as Record<string, string>)[key] ?? key
const neverHook = (() => { throw new Error('panel toggles must not read useSessions') }) as never

function workspaces(itemCount: number): PanelTogglesProps['useWorkspaces'] {
  const state = {
    items: Array.from({ length: itemCount }, () => ({})),
    archivedSessionIds: [],
    state: 'ready',
    phase: 'ready',
    error: null,
    baselinesReady: true,
    recentWorkspaceId: undefined,
  } as unknown as WorkspaceListState
  return sel => sel(state)
}

function mount(opts: {
  surfaces?: number
  terminalDrawer?: number
  workspaceCount?: number
} = {}) {
  const toggleSurfaces = vi.fn()
  const toggleTerminalDrawer = vi.fn()
  render(
    <PanelToggles
      surfaces={opts.surfaces ?? 0}
      terminalDrawer={opts.terminalDrawer ?? 0}
      useSessions={neverHook}
      useWorkspaces={workspaces(opts.workspaceCount ?? 1)}
      toggleSurfaces={toggleSurfaces}
      toggleTerminalDrawer={toggleTerminalDrawer}
      t={t}
    />,
  )
  return { toggleSurfaces, toggleTerminalDrawer }
}

afterEach(cleanup)

describe('PanelToggles', () => {
  it('calls toggleTerminalDrawer when the terminal icon is clicked', () => {
    const b = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle terminal drawer' }))
    expect(b.toggleTerminalDrawer).toHaveBeenCalledOnce()
    expect(b.toggleSurfaces).not.toHaveBeenCalled()
  })

  it('calls toggleSurfaces when the right-panel icon is clicked', () => {
    const b = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle right panel' }))
    expect(b.toggleSurfaces).toHaveBeenCalledOnce()
    expect(b.toggleTerminalDrawer).not.toHaveBeenCalled()
  })

  it('marks the right-panel toggle pressed when surfaces is open', () => {
    mount({ surfaces: 400 })
    expect(screen.getByRole('button', { name: 'Toggle right panel' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Toggle terminal drawer' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('marks the terminal toggle pressed when the drawer is open', () => {
    mount({ terminalDrawer: 280 })
    expect(screen.getByRole('button', { name: 'Toggle terminal drawer' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('Ctrl+\\ toggles the surfaces column', () => {
    const b = mount()
    fireEvent.keyDown(window, { key: '\\', ctrlKey: true })
    expect(b.toggleSurfaces).toHaveBeenCalledOnce()
    expect(b.toggleTerminalDrawer).not.toHaveBeenCalled()
  })

  it('Ctrl+` toggles the terminal drawer when a workspace exists', () => {
    const b = mount()
    fireEvent.keyDown(window, { key: '`', ctrlKey: true })
    expect(b.toggleTerminalDrawer).toHaveBeenCalledOnce()
    expect(b.toggleSurfaces).not.toHaveBeenCalled()
  })

  it('ignores shortcuts while typing in an input', () => {
    const b = mount()
    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { key: '\\', ctrlKey: true })
    fireEvent.keyDown(input, { key: '`', ctrlKey: true })
    expect(b.toggleSurfaces).not.toHaveBeenCalled()
    expect(b.toggleTerminalDrawer).not.toHaveBeenCalled()
    input.remove()
  })

  it('toggles the terminal drawer from an xterm target but not the surfaces column', () => {
    const b = mount()
    const term = document.createElement('div')
    term.className = 'xterm'
    const inner = document.createElement('div')
    term.append(inner)
    document.body.append(term)
    fireEvent.keyDown(inner, { key: '`', ctrlKey: true })
    expect(b.toggleTerminalDrawer).toHaveBeenCalledOnce()
    fireEvent.keyDown(inner, { key: '\\', ctrlKey: true })
    expect(b.toggleSurfaces).not.toHaveBeenCalled()
    term.remove()
  })

  it('disables the terminal toggle when no workspace is available', () => {
    const b = mount({ workspaceCount: 0 })
    const terminal = screen.getByRole<HTMLButtonElement>('button', { name: 'Toggle terminal drawer' })
    expect(terminal.disabled).toBe(true)
    fireEvent.click(terminal)
    expect(b.toggleTerminalDrawer).not.toHaveBeenCalled()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Toggle right panel' }).disabled).toBe(false)
    fireEvent.keyDown(window, { key: '`', ctrlKey: true })
    expect(b.toggleTerminalDrawer).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: '\\', ctrlKey: true })
    expect(b.toggleSurfaces).toHaveBeenCalledOnce()
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
    expect(b.toggleTerminalDrawer).not.toHaveBeenCalled()
  })
})
