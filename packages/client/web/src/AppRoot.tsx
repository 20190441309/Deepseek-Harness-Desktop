/**
 * Shell root: boot loading page → (boot settled) → real UI in one switch.
 * Pure kernel component with zero plugin dependencies — before settled it may
 * only rely on itself (the fail-loud presentation must not depend on the
 * system whose failure it reports; the status/signal stores are kernel-own,
 * shell self-sufficiency rule); the real UI is produced by the
 * app-shell entry once every entry is active. A failed boot keeps the
 * loading page, lists the per-entry fiber states and the sweep report (fail
 * loud, no partial UI).
 */
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { KernelSignal, LoaderStatus } from './loader-status.ts'
import css from './AppRoot.module.css'

/** AppRoot props: settled signal, fiber-state projection feed, boot failure report, deferred real-UI factory. */
export interface AppRootProps {
  /** True once the boot chain settled (loader quiesced + all entries ACTIVE); the boot closure flips it. */
  settled: KernelSignal<boolean>
  /** Per-entry fiber-state projection store (drives loading/failed rendering). */
  status: KernelSignal<LoaderStatus>
  /** Boot failure report (the settle rejection message); undefined while loading or after success. */
  error: KernelSignal<string | undefined>
  /** Builds the real UI; called only after settled. */
  renderApp: () => ReactNode
}

/** Boot gate: loading page until the boot settles; failures stay here. */
export function AppRoot(props: AppRootProps) {
  const settled = useSyncExternalStore(props.settled.subscribe, props.settled.getSnapshot)
  const status = useSyncExternalStore(props.status.subscribe, props.status.getSnapshot)
  const error = useSyncExternalStore(props.error.subscribe, props.error.getSnapshot)
  const failed = Object.entries(status).filter(([, s]) => s === 'failed')
  const total = Object.keys(status).length
  const ready = Object.values(status).filter(state => state === 'active').length

  if (settled) return <>{props.renderApp()}</>

  const loud = error !== undefined || failed.length > 0
  const bootReport = [error, ...failed.map(([id]) => id)]
    .filter((item): item is string => item !== undefined && item !== '')
    .join('\n')
    .slice(0, 400)

  // data-dshd-boot-* is the desktop shell's boot probe surface (it must not scrape
  // rendered copy to decide when the harness view may be revealed).
  return (
    <div
      className={css.boot}
      data-dshd-boot-status={loud ? 'failed' : 'loading'}
      data-dshd-boot-ready={String(ready)}
      data-dshd-boot-total={String(total)}
      data-dshd-boot-error={loud ? bootReport : ''}
    >
      <div className={css.card}>
        <div className={css.wordmark}>HARNESS</div>
        {!loud
          ? (
            <>
              <div className={css.spinner} />
              <div className={css.hint}>
                {total > 0 ? `正在加载插件 ${ready}/${total}` : '正在加载插件…'}
              </div>
            </>
          )
          : (
            <div className={css.failed}>
              <div className={css.failedTitle}>Failed to load plugins</div>
              {failed.map(([id]) => <div key={id} className={css.failedItem}>{id}</div>)}
              {error !== undefined && <div className={css.failedItem}>{error}</div>}
            </div>
          )}
      </div>
    </div>
  )
}
