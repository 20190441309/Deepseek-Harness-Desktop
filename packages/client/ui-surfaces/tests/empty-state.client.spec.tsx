// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EmptyState } from '../src/client/EmptyState.tsx'
import { en } from '../src/client/locales.ts'
import type { OpenableKind } from '../src/client/stores.ts'

const t = (key: string) => (en as Record<string, string>)[key] ?? key

afterEach(cleanup)

describe('EmptyState', () => {
  it('renders five cards and opens the matching kind on click', () => {
    const onOpen = vi.fn<(kind: OpenableKind) => void>()
    render(<EmptyState onOpen={onOpen} t={t} />)

    fireEvent.click(screen.getByRole('button', { name: /Browser/ }))
    fireEvent.click(screen.getByRole('button', { name: /Terminal/ }))
    fireEvent.click(screen.getByRole('button', { name: /Files/ }))
    fireEvent.click(screen.getByRole('button', { name: /Diff/ }))
    fireEvent.click(screen.getByRole('button', { name: /Agents/ }))

    expect(onOpen.mock.calls.map(call => call[0])).toEqual([
      'preview', 'terminal', 'files', 'diff', 'agents',
    ])
    expect(screen.getByText('Open a local app or URL.')).toBeTruthy()
    expect(screen.getByText('Start a shell in this workspace.')).toBeTruthy()
    expect(screen.getByText('Browse and read workspace files.')).toBeTruthy()
    expect(screen.getByText('Review git changes.')).toBeTruthy()
    expect(screen.getByText('Inspect running agents.')).toBeTruthy()
  })

  it('disables the Browser card with the T3code reason outside the desktop app', () => {
    const onOpen = vi.fn<(kind: OpenableKind) => void>()
    render(<EmptyState onOpen={onOpen} t={t} browserAvailable={false} />)

    const browser = screen.getByRole('button', { name: /Browser/ })
    expect(browser).toHaveProperty('disabled', true)
    fireEvent.click(browser)
    expect(onOpen).not.toHaveBeenCalled()
    expect(browser.getAttribute('title')).toBe('Browser previews are only available in the desktop app.')
  })

  it('disables the Diff card with the T3code reason when the workspace is not a git repository', () => {
    const onOpen = vi.fn<(kind: OpenableKind) => void>()
    render(<EmptyState onOpen={onOpen} t={t} diffAvailable={false} />)

    const diff = screen.getByRole('button', { name: /Diff/ })
    expect(diff).toHaveProperty('disabled', true)
    fireEvent.click(diff)
    expect(onOpen).not.toHaveBeenCalled()
    expect(diff.getAttribute('title')).toBe('Diff is only available in Git repositories.')
  })
})
