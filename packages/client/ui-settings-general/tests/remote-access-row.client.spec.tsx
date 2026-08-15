// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RemoteAccessRow } from '../src/client/RemoteAccessRow.tsx'
import type { RemoteAccessRowProps } from '../src/client/RemoteAccessRow.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  delete (window as Window & { shell?: unknown }).shell
})

const unusedHook = (() => { throw new Error('unused by RemoteAccessRow') }) as never

function mount() {
  const props: RemoteAccessRowProps = {
    useSessions: unusedHook,
    useWorkspaces: unusedHook,
    t: key => (en as Record<string, string>)[key] ?? key,
  }
  render(<RemoteAccessRow {...props} />)
}

describe('RemoteAccessRow', () => {
  it('enables remote access and copies the pairing link', async () => {
    const setRemoteEnabled = vi.fn(async () => ({
      enabled: true,
      connected: true,
      pairingUrl: 'https://app.example/#offer=abc',
      qrDataUrl: 'data:image/png;base64,xx',
      devices: [],
    }))
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    ;(window as Window & { shell?: unknown }).shell = {
      getRemoteAccess: async () => ({ enabled: false, devices: [] }),
      setRemoteEnabled,
    }
    mount()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'On' })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'On' }))
    await waitFor(() => {
      expect(screen.getByText('https://app.example/#offer=abc')).toBeTruthy()
    })
    expect(setRemoteEnabled).toHaveBeenCalledWith(true)
    expect(screen.getByRole('img', { name: 'Remote access' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Copy pairing link' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
    })
    expect(writeText).toHaveBeenCalledWith('https://app.example/#offer=abc')
  })

  it('revokes a paired device and ignores a late status read', async () => {
    let resolveStatus: (value: { enabled: boolean }) => void = () => {}
    const revokeRemoteDevice = vi.fn(async () => ({
      enabled: true,
      connected: false,
      pairingUrl: 'https://app.example/#offer=abc',
      devices: [],
    }))
    ;(window as Window & { shell?: unknown }).shell = {
      getRemoteAccess: () => new Promise<{ enabled: boolean }>((resolve) => { resolveStatus = resolve }),
      revokeRemoteDevice,
    }
    const view = render(<RemoteAccessRow
      useSessions={unusedHook}
      useWorkspaces={unusedHook}
      t={key => (en as Record<string, string>)[key] ?? key}
    />)
    view.unmount()
    await act(async () => { resolveStatus({ enabled: true }) })

    ;(window as Window & { shell?: unknown }).shell = {
      getRemoteAccess: async () => ({
        enabled: true,
        connected: false,
        pairingUrl: 'https://app.example/#offer=abc',
        devices: [{ deviceId: 'dev_1', label: 'Pixel' }],
      }),
      setRemoteEnabled: async () => ({ enabled: false, devices: [] }),
      revokeRemoteDevice,
    }
    mount()
    await waitFor(() => {
      expect(screen.getByText('Pixel')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    await waitFor(() => {
      expect(revokeRemoteDevice).toHaveBeenCalledWith('dev_1')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Off' }))
    await waitFor(() => {
      expect(screen.queryByText('Pixel')).toBeNull()
    })
  })

  it('swallows a missing clipboard and a copy with no pairing URL', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('denied') } },
    })
    ;(window as Window & { shell?: unknown }).shell = {
      getRemoteAccess: async () => ({
        enabled: true,
        connected: false,
        pairingUrl: null,
        devices: [],
      }),
      setRemoteEnabled: async () => undefined,
      revokeRemoteDevice: async () => undefined,
    }
    mount()
    await waitFor(() => {
      expect(screen.getByText('No paired devices yet.')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy pairing link' }))
    expect(screen.getByRole('button', { name: 'Copy pairing link' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Off' }))
  })

  it('keeps the disabled default when the sidecar cannot be read', async () => {
    ;(window as Window & { shell?: unknown }).shell = {
      getRemoteAccess: async () => { throw new Error('unavailable') },
    }
    mount()
    expect(screen.getByRole('button', { name: 'On' })).toBeTruthy()
    expect(screen.queryByText('No paired devices yet.')).toBeNull()
  })
})
