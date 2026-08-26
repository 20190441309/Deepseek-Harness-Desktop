// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteSection } from '../src/client/RemoteSection.tsx'
import type { RemoteSectionProps } from '../src/client/RemoteSection.tsx'
import type { RemotePatch, RemoteSnapshot } from '../src/client/desktop-shell.ts'
import { en, type RemoteLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: RemoteLocaleKey, vars?: Record<string, string>): string => {
  let text: string = en[key]
  for (const [name, value] of Object.entries(vars ?? {})) text = text.replaceAll(`{${name}}`, value)
  return text
}) as RemoteSectionProps['t']

const SNAP: RemoteSnapshot = {
  enabled: true,
  listening: true,
  port: 3180,
  mode: 'lan',
  bindAddress: '0.0.0.0',
  lanTls: false,
  addresses: ['10.0.0.4'],
  relayUrl: 'https://relay.example',
  relayConfigured: true,
  relayConnected: false,
  urls: [
    { address: '10.0.0.4', url: 'http://10.0.0.4:3180/', pairingUrl: 'http://10.0.0.4:3180/#offer=abc' },
  ],
}

function snap(overrides: Partial<RemoteSnapshot> = {}): RemoteSnapshot {
  return { ...SNAP, ...overrides }
}

function renderRemote(overrides: Partial<RemoteSectionProps> = {}) {
  const props = {
    wide: true,
    t,
    getRemote: vi.fn(async () => SNAP),
    saveRemote: vi.fn(async () => SNAP),
    unbindRemoteDevice: vi.fn(async () => SNAP),
    ...overrides,
  } as RemoteSectionProps
  render(<RemoteSection {...props} />)
  return props
}

describe('RemoteSection', () => {
  it('keeps the Remote trigger dim until remote is on, then lights it', async () => {
    const props = renderRemote({
      getRemote: vi.fn(async () => snap({ enabled: false, listening: false })),
      saveRemote: vi.fn(async (patch: RemotePatch) => snap({ enabled: patch.remoteEnabled ?? false })),
    })
    const trigger = await screen.findByRole('button', { name: en.trigger })
    expect(trigger.getAttribute('data-dsh-remote-trigger')).toBe('')
    expect(trigger.getAttribute('data-on')).toBeNull()
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole('radio', { name: en.enabledOn }))
    await waitFor(() => { expect(props.saveRemote).toHaveBeenCalledWith({ remoteEnabled: true }) })
    expect(screen.getByRole('button', { name: en.trigger }).hasAttribute('data-on')).toBe(true)
  })

  it('opens a popup with on/off and the pairing QR, without LAN/relay or leaking the URL', async () => {
    renderRemote()
    fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.heading })
    expect(screen.getByRole('radio', { name: en.enabledOn })).toBeTruthy()
    expect(screen.getByRole('radio', { name: en.enabledOff })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: en.modeLan })).toBeNull()
    expect(screen.queryByRole('radio', { name: en.modeRelay })).toBeNull()
    expect(screen.getByRole('img', { name: en.qr })).toBeTruthy()
    expect(screen.queryByText(/#offer=/)).toBeNull()
    expect(screen.queryByText('3180')).toBeNull()
  })

  it('shows the off hint until the gateway is enabled', async () => {
    renderRemote({
      getRemote: vi.fn(async () => snap({ enabled: false, listening: false, urls: [] })),
    })
    fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
    await screen.findByText(en.offHint)
  })

  it('keeps connection mode, bind scope, and LAN TLS off the pairing popup', async () => {
    renderRemote()
    fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.heading })
    expect(screen.queryByRole('radio', { name: en.modeLan })).toBeNull()
    expect(screen.queryByRole('radio', { name: en.modeRelay })).toBeNull()
    expect(screen.queryByText(en.relayNeedsBoth)).toBeNull()
    expect(screen.queryByText(en.relayNeedsToken)).toBeNull()
    expect(screen.queryByText(en.relayNeedsUrl)).toBeNull()
    expect(screen.queryByRole('radio', { name: en.bindAll })).toBeNull()
    expect(screen.queryByRole('radio', { name: en.bindLoopback })).toBeNull()
    expect(screen.queryByRole('radio', { name: en.transportPlain })).toBeNull()
    expect(screen.queryByRole('radio', { name: en.transportTls })).toBeNull()
    expect(screen.queryByText(en.lanPlaintextWarning)).toBeNull()
    expect(screen.queryByText('10.0.0.4')).toBeNull()
  })

  it('shows loading while the first read is in flight', async () => {
    let finish: (value: RemoteSnapshot) => void = () => {}
    renderRemote({
      getRemote: vi.fn(() => new Promise<RemoteSnapshot>((resolve) => { finish = resolve })),
    })
    fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
    await screen.findByText(en.loading)
    finish(SNAP)
    await screen.findByRole('img', { name: en.qr })
  })

  it('shows a retry control when the first read fails, then the QR', async () => {
    const getRemote = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(SNAP)
    renderRemote({ getRemote })
    fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
    await screen.findByText(en.error)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await screen.findByRole('img', { name: en.qr })
  })

  it('surfaces a save failure and stringifies non-Error load failures', async () => {
    renderRemote({ getRemote: vi.fn(async () => { throw 'offline' }) })
    fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
    await screen.findByText(en.error)
    cleanup()
    const props = renderRemote({
      saveRemote: vi.fn(async () => { throw 'write failed' }),
    })
    fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
    fireEvent.click(await screen.findByRole('radio', { name: en.enabledOff }))
    await waitFor(() => { expect(props.saveRemote).toHaveBeenCalled() })
    await screen.findByText('Remote error: write failed')
    cleanup()
    const fromSnap = renderRemote({
      getRemote: vi.fn(async () => snap({ error: 'gateway down' })),
      saveRemote: vi.fn(async () => { throw new Error('save exploded') }),
    })
    fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
    await screen.findByText('Remote error: gateway down')
    fireEvent.click(screen.getByRole('radio', { name: en.enabledOff }))
    await waitFor(() => { expect(fromSnap.saveRemote).toHaveBeenCalled() })
    await screen.findByText('Remote error: save exploded')
  })

  it('closes on mask click and Escape', async () => {
    renderRemote()
    fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.heading })
    const dialog = screen.getByRole('dialog', { name: en.heading })
    fireEvent.click(dialog.previousElementSibling as Element)
    expect(screen.queryByRole('dialog', { name: en.heading })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.heading })
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('dialog', { name: en.heading })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: en.heading })).toBeNull()
  })

  it('shows a no-QR hint when enabled without a pairing URL', async () => {
    renderRemote({
      getRemote: vi.fn(async () => snap({ urls: [] })),
    })
    fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
    await screen.findByText(en.noQr)
  })

  it('renders the rail trigger without a text label', async () => {
    renderRemote({ wide: false })
    const trigger = await screen.findByRole('button', { name: en.trigger })
    expect(trigger.textContent).toBe('')
  })

  it('applies an empty snapshot when getRemote returns null', async () => {
    renderRemote({ getRemote: vi.fn(async () => null) })
    fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
    await screen.findByText(en.offHint)
  })

  it('shows the bound-device count and unbinds from the management dialog', async () => {
    const device = {
      id: 'dev-1',
      name: 'iPhone',
      detail: 'iPhone · iOS 18 · Safari',
      shortId: 'ev-1',
      createdAt: '2026-08-14T11:00:00.000Z',
      lastSeenAt: '2026-08-14T12:00:00.000Z',
      online: true,
    }
    const withDevice = snap({ devices: [device] })
    const props = renderRemote({
      getRemote: vi.fn(async () => withDevice),
      unbindRemoteDevice: vi.fn(async () => snap({ devices: [] })),
    })
    fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
    fireEvent.click(await screen.findByRole('button', { name: `${en.devices} 1` }))
    await screen.findByRole('dialog', { name: en.devicesManage })
    expect(screen.getByText('iPhone')).toBeTruthy()
    expect(screen.getByText(en.devicesOnline)).toBeTruthy()
    expect(screen.getByText('iPhone · iOS 18 · Safari')).toBeTruthy()
    expect(screen.getByText(`ID ${device.shortId}`)).toBeTruthy()
    expect(screen.getByText(/Bound /)).toBeTruthy()
    expect(screen.getByText(/Last seen /)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.unbind }))
    await waitFor(() => { expect(props.unbindRemoteDevice).toHaveBeenCalledWith('dev-1') })
    await screen.findByText(en.devicesEmpty)
  })

  it('opens an empty device dialog, surfaces unbind failures, and closes inner then outer on Escape', async () => {
    const props = renderRemote({
      getRemote: vi.fn(async () => snap({
        devices: [
          { id: 'dev-2', name: 'Android' },
          { id: 'dev-3', name: 'Mac', lastSeenAt: 'not-a-date' },
        ],
      })),
      unbindRemoteDevice: vi.fn(async () => { throw 'drop failed' }),
    })
    fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
    fireEvent.click(await screen.findByRole('button', { name: `${en.devices} 2` }))
    expect(screen.getByText(en.devicesSeenUnknown)).toBeTruthy()
    expect(screen.getByText(en.devicesSeen.replace('{time}', en.devicesSeenUnknown))).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: en.unbind })[0]!)
    await waitFor(() => { expect(props.unbindRemoteDevice).toHaveBeenCalledWith('dev-2') })
    await screen.findByText('Remote error: drop failed')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: en.devicesManage })).toBeNull()
    expect(screen.getByRole('dialog', { name: en.heading })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: en.heading })).toBeNull()
    cleanup()
    const exploded = renderRemote({
      getRemote: vi.fn(async () => snap({ devices: [{ id: 'dev-4', name: 'Windows' }] })),
      unbindRemoteDevice: vi.fn(async () => { throw new Error('drop exploded') }),
    })
    fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
    fireEvent.click(await screen.findByRole('button', { name: `${en.devices} 1` }))
    fireEvent.click(screen.getByRole('button', { name: en.unbind }))
    await waitFor(() => { expect(exploded.unbindRemoteDevice).toHaveBeenCalledWith('dev-4') })
    await screen.findByText('Remote error: drop exploded')
    cleanup()
    renderRemote({ getRemote: vi.fn(async () => snap({ devices: [] })) })
    fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
    fireEvent.click(await screen.findByRole('button', { name: `${en.devices} 0` }))
    await screen.findByText(en.devicesEmpty)
    fireEvent.click(screen.getByRole('dialog', { name: en.devicesManage }).previousElementSibling as Element)
    expect(screen.queryByRole('dialog', { name: en.devicesManage })).toBeNull()
  })

  it('refreshes the snapshot while the popup is open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      const getRemote = vi.fn()
        .mockResolvedValueOnce(SNAP)
        .mockResolvedValueOnce(snap({ devices: [{ id: 'later', name: 'Android' }] }))
        .mockRejectedValueOnce('poll fail')
        .mockRejectedValueOnce(new Error('poll exploded'))
      renderRemote({ getRemote })
      fireEvent.click(await screen.findByRole('button', { name: en.trigger }))
      await screen.findByRole('button', { name: `${en.devices} 0` })
      await vi.advanceTimersByTimeAsync(2000)
      await screen.findByRole('button', { name: `${en.devices} 1` })
      await vi.advanceTimersByTimeAsync(2000)
      await screen.findByText('Remote error: poll fail')
      await vi.advanceTimersByTimeAsync(2000)
      await screen.findByText('Remote error: poll exploded')
    } finally {
      vi.useRealTimers()
    }
  })
})
