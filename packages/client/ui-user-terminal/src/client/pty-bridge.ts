/** One PTY listener pair for every live store instance. */
import type { TerminalShellInjected } from './shell.ts'
import type { TerminalSessionStoreHandle } from './stores.ts'

/**
 * Subscribe once to desktop PTY data/exit and fan out to live store instances.
 * Drawer and surface must not subscribe themselves.
 * @param store - the shared handle seated on both shells.
 * @param pty - desktop PTY listener pair.
 * @returns disposer that drops both subscriptions.
 */
export function bindPtyListeners(
  store: Pick<TerminalSessionStoreHandle, 'dispatchData' | 'dispatchExit'>,
  pty: Pick<TerminalShellInjected, 'onPtyData' | 'onPtyExit'>,
): () => void {
  const offData = pty.onPtyData(payload => { store.dispatchData(payload.id, payload.data) })
  const offExit = pty.onPtyExit(payload => { store.dispatchExit(payload.id) })
  return () => {
    offData()
    offExit()
  }
}
