// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GitProgressToast } from '../src/client/GitProgressToast.tsx'

afterEach(cleanup)

describe('GitProgressToast', () => {
  it('shows the title, elapsed subtitle, and dismisses', () => {
    const onClose = vi.fn()
    render(
      <GitProgressToast
        state={{ tone: 'loading', title: 'Generating commit message...', startedAt: Date.now() }}
        dismissLabel="Dismiss notification"
        onClose={onClose}
      />,
    )
    expect(screen.getByRole('status', { name: 'Generating commit message...' })).toBeTruthy()
    expect(screen.getByText('Running for 0s')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps Waiting for Git until a start timestamp exists', () => {
    render(
      <GitProgressToast
        state={{
          tone: 'loading',
          title: 'Generating commit message...',
          description: 'Waiting for Git...',
          startedAt: null,
        }}
        dismissLabel="Dismiss notification"
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Waiting for Git...')).toBeTruthy()
    expect(screen.queryByText(/Running for/)).toBeNull()
  })

  it('keeps a hook line as the subtitle while loading', () => {
    render(
      <GitProgressToast
        state={{
          tone: 'loading',
          title: 'Running pre-commit...',
          description: 'lefthook v2.1.10',
          startedAt: Date.now(),
        }}
        dismissLabel="Dismiss notification"
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('lefthook v2.1.10')).toBeTruthy()
    expect(screen.queryByText('Running for 0s')).toBeNull()
  })

  it('renders a success title without a timer', () => {
    render(
      <GitProgressToast
        state={{ tone: 'success', title: 'Committed changes', startedAt: null }}
        dismissLabel="Dismiss notification"
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('status', { name: 'Committed changes' })).toBeTruthy()
    expect(screen.queryByText(/Running for/)).toBeNull()
  })

  it('copies the error dump and expands details', () => {
    const writeText = vi.fn()
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <GitProgressToast
        state={{
          tone: 'error',
          title: 'Action failed',
          description: 'lefthook failed',
          details: 'lefthook failed\noxfmt --check',
          startedAt: null,
          copyLabel: 'Copy error',
          detailsLabel: 'Show details',
          hideDetailsLabel: 'Hide details',
        }}
        dismissLabel="Dismiss notification"
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Copy error' }))
    expect(writeText).toHaveBeenCalledWith('lefthook failed\noxfmt --check')
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
    expect(screen.getByText(/oxfmt --check/)).toBeTruthy()
  })
})
