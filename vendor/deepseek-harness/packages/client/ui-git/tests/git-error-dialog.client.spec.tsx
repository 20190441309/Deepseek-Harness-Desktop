// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GitErrorDialog, splitGitError } from '../src/client/GitErrorDialog.tsx'

afterEach(cleanup)

describe('splitGitError', () => {
  it('keeps a blank dump as the headline', () => {
    expect(splitGitError('')).toEqual({ headline: '', detail: null })
  })

  it('keeps a single line as the headline', () => {
    expect(splitGitError('checkout failed')).toEqual({
      headline: 'checkout failed',
      detail: null,
    })
  })

  it('picks a hook/format line as the headline and keeps the dump', () => {
    const message = [
      'husky - pre-commit',
      'Checking formatting...',
      'Format issues found in above 7 files. Run without `--check` to fix.',
    ].join('\n')
    const split = splitGitError(message)
    expect(split.headline).toBe('Format issues found in above 7 files. Run without `--check` to fix.')
    expect(split.detail).toBe(message)
  })
})

describe('GitErrorDialog', () => {
  it('shows the headline and a scrollable log for a hook dump', () => {
    const onClose = vi.fn()
    render(
      <GitErrorDialog
        open
        title="Action failed"
        closeLabel="Close"
        message={'husky - pre-commit\nFormat issues found in above 7 files.'}
        onClose={onClose}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Action failed' })).toBeTruthy()
    expect(screen.getByText('Format issues found in above 7 files.')).toBeTruthy()
    expect(screen.getByText(/husky - pre-commit/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[1]!)
    expect(onClose).toHaveBeenCalled()
  })
})
