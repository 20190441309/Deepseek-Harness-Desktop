// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AboutSection } from '../src/client/AboutSection.tsx'
import type { AboutSectionProps } from '../src/client/AboutSection.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  delete (window as Window & { shell?: unknown }).shell
})

function translate(key: string, params?: Record<string, string>) {
  let text = (en as Record<string, string>)[key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, value)
    }
  }
  return text
}

function mount() {
  const props = { t: translate } as AboutSectionProps
  render(<AboutSection {...props} />)
}

describe('AboutSection data folder', () => {
  it('hides the open-home control without a desktop opener', () => {
    mount()
    expect(screen.queryByRole('button', { name: 'Open data folder' })).toBeNull()
  })

  it('shows the bound home path and opens it without a renderer path', async () => {
    const openDshHome = vi.fn(async () => ({ ok: true as const, path: 'C:\\Users\\me\\dsh-home' }))
    ;(window as Window & { shell?: unknown }).shell = {
      getConfig: async () => ({ dshHome: 'C:\\Users\\me\\dsh-home', appVersion: '0.2.7' }),
      openDshHome,
    }
    mount()
    await waitFor(() => {
      expect(screen.getByText('Data folder C:\\Users\\me\\dsh-home')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open data folder' }))
    await waitFor(() => {
      expect(openDshHome).toHaveBeenCalledTimes(1)
    })
    expect(openDshHome.mock.calls[0]).toEqual([])
  })
})
