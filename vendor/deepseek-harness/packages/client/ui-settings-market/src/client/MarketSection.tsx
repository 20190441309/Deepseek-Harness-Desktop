import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  InstalledPlugin,
  MarketCatalog,
  MarketItem,
  PluginOpResult,
  PluginProgress,
} from './desktop-shell.ts'
import css from './MarketSection.module.css'

/** Registration-side desktop callbacks used by the marketplace section. */
export interface MarketSectionInjected {
  /** Read the curated catalog (localized main-process payload). */
  listCatalog: (options?: { refresh?: boolean }) => Promise<MarketCatalog>
  /** Read the profile's installed-plugin rows. */
  listInstalled: () => Promise<InstalledPlugin[]>
  /** Install one catalog row by registry id; the engine restarts Harness. */
  install: (id: string, options?: { allowBuilds?: string[] }) => Promise<PluginOpResult>
  /** Uninstall one installed package by name; the engine restarts Harness. */
  uninstall: (name: string) => Promise<PluginOpResult>
  /** Subscribe to install/uninstall/restart progress lines. */
  onProgress: (listener: (payload: PluginProgress) => void) => () => void
}

/** Full component props assembled by the Settings section slot. */
export type MarketSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.market'>
  & InjectFace<MarketSectionInjected>

type CatalogState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly catalog: MarketCatalog }

type BusyOp = { kind: 'install' | 'uninstall'; id: string } | null

type Notice = { kind: 'ok' | 'error'; text: string } | null

type AllowBuildsAsk = { item: MarketItem; keys: string[] } | null

const PROGRESS_LINES = 6

/** The installed package name backing one catalog row, or null. */
function installedNameFor(item: MarketItem, plugins: InstalledPlugin[]): string | null {
  if (item.packageName && plugins.some(row => row.name === item.packageName)) {
    return item.packageName
  }
  const key = `${item.owner}/${item.repo}`.toLowerCase()
  const bySpec = plugins.find(row => row.spec.toLowerCase().includes(key))
  return bySpec ? bySpec.name : null
}

/** Whether one catalog row matches the local search query. */
function matches(item: MarketItem, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return [item.id, item.description, item.packageName]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

/**
 * Marketplace settings section: curated catalog browse/search with per-row
 * install/uninstall, allow-builds approval, and progress lines. All engine
 * work happens in the desktop main process behind the injected callbacks.
 * @param props - composed slot props plus the desktop inject face.
 * @returns the section content.
 */
export function MarketSection({
  t,
  listCatalog,
  listInstalled,
  install,
  uninstall,
  onProgress,
}: MarketSectionProps): ReactNode {
  const [state, setState] = useState<CatalogState>({ status: 'loading' })
  const [installed, setInstalled] = useState<InstalledPlugin[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [busy, setBusy] = useState<BusyOp>(null)
  const [progress, setProgress] = useState<string[]>([])
  const [notice, setNotice] = useState<Notice>(null)
  const [ask, setAsk] = useState<AllowBuildsAsk>(null)
  const alive = useRef(true)

  useEffect(() => () => { alive.current = false }, [])

  const reloadInstalled = useCallback(async () => {
    try {
      const plugins = await listInstalled()
      if (alive.current) setInstalled(plugins)
    } catch {
      // The installed list is a secondary annotation; the catalog stays usable.
    }
  }, [listInstalled])

  const load = useCallback(async (refresh: boolean) => {
    setState(current => (current.status === 'ready' ? current : { status: 'loading' }))
    try {
      const catalog = await listCatalog(refresh ? { refresh: true } : undefined)
      if (alive.current) setState({ status: 'ready', catalog })
    } catch {
      if (alive.current) setState({ status: 'error' })
    }
    void reloadInstalled()
  }, [listCatalog, reloadInstalled])

  useEffect(() => { void load(false) }, [load])

  const runOp = useCallback(async (
    op: BusyOp & object,
    work: () => Promise<PluginOpResult>,
    doneText: string,
  ) => {
    setBusy(op)
    setNotice(null)
    setAsk(null)
    setProgress([])
    const off = onProgress((payload) => {
      if (!alive.current) return
      const line = payload.phase === 'restart' ? t('restarting') : payload.line
      if (!line) return
      setProgress(current => [...current.slice(-(PROGRESS_LINES - 1)), line])
    })
    try {
      const result = await work()
      if (!alive.current) return
      if (result.ok) {
        setNotice(result.harnessStarted === false
          ? { kind: 'error', text: result.error || t('harnessDown') }
          : { kind: 'ok', text: doneText })
      } else if (result.needsAllowBuilds && op.kind === 'install') {
        const item = state.status === 'ready'
          ? state.catalog.items.find(row => row.id === op.id) ?? null
          : null
        if (item) setAsk({ item, keys: result.allowBuilds ?? [] })
        else setNotice({ kind: 'error', text: t('opFailed', { message: result.error || 'allowBuilds' }) })
      } else {
        setNotice({ kind: 'error', text: t('opFailed', { message: result.error || 'unknown' }) })
      }
    } catch (caught) {
      if (alive.current) {
        setNotice({ kind: 'error', text: t('opFailed', { message: caught instanceof Error ? caught.message : String(caught) }) })
      }
    } finally {
      off()
      if (alive.current) {
        setBusy(null)
        setProgress([])
        void reloadInstalled()
      }
    }
  }, [onProgress, reloadInstalled, state, t])

  const startInstall = useCallback((item: MarketItem, allowBuilds?: string[]) => {
    void runOp(
      { kind: 'install', id: item.id },
      () => install(item.id, allowBuilds && allowBuilds.length > 0 ? { allowBuilds } : undefined),
      t('installDone'),
    )
  }, [install, runOp, t])

  const startUninstall = useCallback((item: MarketItem, name: string) => {
    void runOp({ kind: 'uninstall', id: item.id }, () => uninstall(name), t('uninstallDone'))
  }, [runOp, t, uninstall])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const items = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.catalog.items.filter(item => (
      (category === 'all' || item.category === category) && matches(item, normalizedQuery)
    ))
  }, [category, normalizedQuery, state])

  return (
    <div className={css.section} aria-busy={state.status === 'loading'}>
      {state.status === 'loading' ? <p className={css.status} role="status">{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure}>
          <p role="alert">{t('loadError')}</p>
          <button type="button" onClick={() => { void load(true) }}>{t('retry')}</button>
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <div className={css.catalog}>
          <div className={css.toolbar}>
            <label className={css.search}>
              <IconSearchOutline16 aria-hidden="true" />
              <span className={css.visuallyHidden}>{t('search')}</span>
              <input
                type="search"
                value={query}
                placeholder={t('search')}
                aria-label={t('search')}
                onChange={(event) => { setQuery(event.currentTarget.value) }}
              />
            </label>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => { void load(true) }}
            >
              {t('refresh')}
            </Button>
          </div>
          {state.catalog.categories.length > 1 ? (
            <div className={css.categories} role="radiogroup" aria-label={t('heading')}>
              {state.catalog.categories.map(row => (
                <button
                  key={row.id}
                  type="button"
                  className={css.category}
                  role="radio"
                  aria-checked={category === row.id}
                  data-active={category === row.id || undefined}
                  onClick={() => { setCategory(row.id) }}
                >
                  {row.label}
                  <span className={css.categoryCount}>{row.count}</span>
                </button>
              ))}
            </div>
          ) : null}
          {state.catalog.warning ? <p className={css.warning} role="status">{state.catalog.warning}</p> : null}
          {notice ? (
            <p
              className={css.notice}
              data-kind={notice.kind}
              role={notice.kind === 'error' ? 'alert' : 'status'}
            >
              {notice.text}
            </p>
          ) : null}
          {ask ? (
            <div className={css.allowBuilds} role="alertdialog" aria-label={t('allowBuildsAsk', { name: ask.item.repo })}>
              <p>{t('allowBuildsAsk', { name: ask.item.repo })}</p>
              {ask.keys.length > 0 ? <code>{t('allowBuildsKeys', { keys: ask.keys.join(', ') })}</code> : null}
              <div className={css.allowBuildsActions}>
                <Button size="sm" variant="primary" onClick={() => { startInstall(ask.item, ask.keys) }}>
                  {t('allowBuildsConfirm')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setAsk(null) }}>
                  {t('allowBuildsCancel')}
                </Button>
              </div>
            </div>
          ) : null}
          {busy && progress.length > 0 ? (
            <div className={css.progress} role="log" aria-label={t('progressHeading')}>
              {progress.map((line, position) => <code key={`${position}-${line}`}>{line}</code>)}
            </div>
          ) : null}
          <div className={css.catalogHeading}>
            <h3>{t('heading')}</h3>
            <span data-market-count={items.length}>{t('count', { count: String(items.length) })}</span>
          </div>
          {state.catalog.items.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
          {state.catalog.items.length > 0 && items.length === 0
            ? <p className={css.status}>{t('emptySearch')}</p>
            : null}
          {items.length > 0 ? (
            <ul className={css.cards}>
              {items.map((item) => {
                const installedName = installedNameFor(item, installed)
                const isBusy = busy !== null
                const isThis = busy?.id === item.id
                return (
                  <li className={css.card} key={item.id} data-market-item={item.id}>
                    <div className={css.cardBody}>
                      <div className={css.cardHead}>
                        <strong className={css.cardTitle} title={item.id}>{item.repo}</strong>
                        <span className={css.cardOwner}>{item.owner}</span>
                        {installedName ? <span className={css.installedTag}>{t('installed')}</span> : null}
                      </div>
                      {item.description ? <p className={css.cardDescription}>{item.description}</p> : null}
                      <div className={css.cardMeta}>
                        {item.category ? <span className={css.metaTag}>{item.category}</span> : null}
                        <span className={css.metaStars}>{t('stars', { count: String(item.stars) })}</span>
                      </div>
                    </div>
                    <div className={css.cardActions}>
                      {installedName ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isBusy}
                          onClick={() => { startUninstall(item, installedName) }}
                        >
                          {isThis && busy?.kind === 'uninstall' ? t('uninstalling') : t('uninstall')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={isBusy}
                          onClick={() => { startInstall(item) }}
                        >
                          {isThis && busy?.kind === 'install' ? t('installing') : t('install')}
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
