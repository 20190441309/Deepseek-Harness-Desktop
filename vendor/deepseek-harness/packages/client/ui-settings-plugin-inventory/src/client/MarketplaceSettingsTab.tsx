import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { IconChevronDownOutline14, IconCloseOutline16, IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  InstalledPlugins,
  MarketplaceCatalog,
  MarketplaceInstallResult,
  MarketplaceItem,
  MarketplaceProgress,
} from './desktop-shell.ts'
import type { InstallDraftItem } from './seed-install-draft.ts'
import css from './MarketplaceSettingsTab.module.css'

/** Registration-side desktop callbacks used by the marketplace tab. */
export interface MarketplaceSettingsTabInjected {
  /** Read the cached or refreshed GitHub catalog. */
  listMarketplace: (options?: { refresh?: boolean }) => Promise<MarketplaceCatalog>
  /** Read web-profile installed packages. */
  listInstalled: () => Promise<InstalledPlugins>
  /** Close Settings, open a blank session, and prefill an install request. Does not send. */
  seedInstallDraft: (item: InstallDraftItem) => Promise<void>
  /** Remove one installed package from the web profile. */
  uninstallPlugin: (name: string) => Promise<MarketplaceInstallResult>
  /** Open a repository URL in the system browser. */
  openExternal: (url: string) => Promise<boolean>
  /** Persist an optional GitHub token. */
  saveGithubToken: (token: string) => Promise<void>
  /** Whether a GitHub token is already stored. */
  hasGithubToken: () => Promise<boolean>
  /** Subscribe to install log lines. */
  onProgress: (handler: (payload: MarketplaceProgress) => void) => () => void
}

/** Full component props assembled by the Settings slot renderer. */
export type MarketplaceSettingsTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.pluginInventory'>
  & InjectFace<MarketplaceSettingsTabInjected>

type DialogState = {
  title: string
  body: string
  ok: string
  log: string
  resolve: (value: boolean) => void
}

type SortId = 'hot' | 'new'

function installedName(item: MarketplaceItem, installed: Map<string, string>): string {
  if (item.packageName && installed.has(item.packageName)) return item.packageName
  for (const [name, spec] of installed) {
    if (spec.includes(`${item.owner}/${item.repo}`)) return name
  }
  return ''
}

function categoryLabel(
  id: string,
  categories: MarketplaceCatalog['categories'],
  t: MarketplaceSettingsTabProps['t'],
): string {
  return categories?.find(row => row.id === id)?.label ?? t('marketOther')
}

function starCount(item: MarketplaceItem): number {
  const n = Number(item.stars)
  return Number.isFinite(n) ? n : 0
}

function dedupeItems(items: MarketplaceItem[]): MarketplaceItem[] {
  const seen = new Set<string>()
  const result: MarketplaceItem[] = []
  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue
    seen.add(item.id)
    result.push({ ...item, stars: starCount(item) })
  }
  return result
}

function activityTime(item: MarketplaceItem): number {
  return Date.parse(item.pushed || item.updated || '') || 0
}

function formatDay(value: string | undefined): string {
  const ms = Date.parse(value || '')
  return Number.isNaN(ms) ? '' : new Date(ms).toISOString().slice(0, 10)
}

function sortItems(items: MarketplaceItem[], sort: SortId): MarketplaceItem[] {
  return [...items].sort((left, right) => {
    const hot = starCount(right) - starCount(left)
    if (sort === 'hot') return hot || left.id.localeCompare(right.id)
    const newest = activityTime(right) - activityTime(left)
    return newest || hot || left.id.localeCompare(right.id)
  })
}

/** Desktop marketplace catalog inside Settings → Plugins. */
export function MarketplaceSettingsTab({
  t,
  close,
  listMarketplace,
  listInstalled,
  seedInstallDraft,
  uninstallPlugin,
  openExternal,
  saveGithubToken,
  hasGithubToken,
  onProgress,
}: MarketplaceSettingsTabProps): ReactNode {
  const [items, setItems] = useState<MarketplaceItem[]>([])
  const [categories, setCategories] = useState<MarketplaceCatalog['categories']>([])
  const [installed, setInstalled] = useState<Map<string, string>>(new Map())
  const [warning, setWarning] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState<'all' | 'installable' | 'installed'>('all')
  const [sort, setSort] = useState<SortId>('hot')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [tokenSaved, setTokenSaved] = useState(false)
  const [token, setToken] = useState('')
  const [detail, setDetail] = useState<MarketplaceItem | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [log, setLog] = useState('')

  const load = async (refresh = false): Promise<void> => {
    setBusy(true)
    try {
      const [catalog, profile] = await Promise.all([
        listMarketplace({ refresh }),
        listInstalled(),
      ])
      const next = dedupeItems(catalog.items ?? [])
      if (next.length > 0) {
        setItems(next)
        setCategories(catalog.categories ?? [])
        setDetail(current => current ? next.find(item => item.id === current.id) ?? current : null)
      }
      setWarning(catalog.warning ?? '')
      setInstalled(new Map((profile.plugins ?? []).map(row => [row.name, row.spec])))
    } catch {
      setWarning(t('marketError'))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load(false)
    void hasGithubToken().then(setTokenSaved)
    return onProgress((payload) => {
      const line = payload.line
      if (line) setLog(current => current ? `${current}\n${line}` : line)
    })
  }, [listMarketplace, listInstalled, hasGithubToken, onProgress, t])

  useEffect(() => {
    if (!detail) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !dialog) setDetail(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [detail, dialog])

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    const filtered = items.filter((item) => {
      if (category !== 'all' && item.category !== category) return false
      const name = installedName(item, installed)
      if (status === 'installed' && !name) return false
      if (status === 'installable' && (name || !item.isBundle)) return false
      if (!needle) return true
      return [item.id, item.packageName, item.description].join(' ').toLocaleLowerCase().includes(needle)
    })
    return sortItems(filtered, sort)
  }, [items, category, status, query, installed, sort])

  const ask = (title: string, body: string, ok: string, extraLog = ''): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({ title, body, ok, log: extraLog, resolve })
    })
  }

  const closeDialog = (value: boolean): void => {
    const current = dialog
    setDialog(null)
    current?.resolve(value)
  }

  const runInstall = (item: MarketplaceItem): void => {
    close()
    void seedInstallDraft({ repo: item.repo, installSpec: item.installSpec })
  }

  const runUninstall = async (name: string): Promise<void> => {
    const confirmed = await ask(t('marketRemoveTitle'), t('marketRemoveBody').replace('{name}', name), t('marketRemoveOk'))
    if (!confirmed) return
    setBusy(true)
    const result = await uninstallPlugin(name)
    if (!result.ok) await ask(t('marketFailTitle'), result.error || t('marketFail'), t('marketOk'), result.log ?? '')
    setBusy(false)
    await load(false)
  }

  const saveToken = async (): Promise<void> => {
    const value = token.trim()
    if (!value) return
    await saveGithubToken(value)
    setToken('')
    setTokenSaved(true)
  }

  const detailName = detail ? installedName(detail, installed) : ''
  const updated = formatDay(detail?.pushed || detail?.updated)
  const topics = [...new Set([...(detail?.topics ?? []), ...(detail?.keywords ?? [])])].filter(Boolean)

  return (
    <div className={css.section} aria-busy={busy}>
      <div className={css.toolbar}>
        <label className={css.search}>
          <IconSearchOutline16 aria-hidden="true" />
          <span className={css.visuallyHidden}>{t('marketSearch')}</span>
          <input
            type="search"
            value={query}
            placeholder={t('marketSearch')}
            aria-label={t('marketSearch')}
            onChange={(event) => { setQuery(event.currentTarget.value) }}
          />
        </label>
        <input
          type="password"
          className={css.token}
          value={token}
          placeholder={tokenSaved ? t('marketTokenSaved') : t('marketToken')}
          aria-label={t('marketToken')}
          onChange={(event) => { setToken(event.currentTarget.value) }}
          onBlur={() => { void saveToken() }}
        />
        <button type="button" className={css.refresh} disabled={busy} onClick={() => { void load(true) }}>{t('marketRefresh')}</button>
      </div>
      <div className={css.tabs} role="tablist" aria-label={t('marketCategories')}>
        {(categories ?? []).map(row => (
          <button
            key={row.id}
            type="button"
            role="tab"
            className={css.tab}
            aria-selected={category === row.id}
            data-active={category === row.id ? 'true' : undefined}
            onClick={() => { setCategory(row.id) }}
          >
            {row.label}
            <span>{row.count}</span>
          </button>
        ))}
      </div>
      <div className={css.controls}>
        <label className={css.control}>
          <span>{t('marketStatus')}</span>
          <span className={css.selectWrap}>
            <select
              aria-label={t('marketStatus')}
              value={status}
              onChange={(event) => { setStatus(event.currentTarget.value as typeof status) }}
            >
              <option value="all">{t('marketStatusAll')}</option>
              <option value="installable">{t('marketInstallable')}</option>
              <option value="installed">{t('marketInstalled')}</option>
            </select>
            <IconChevronDownOutline14 aria-hidden="true" />
          </span>
        </label>
        <label className={css.control}>
          <span>{t('marketSort')}</span>
          <span className={css.selectWrap}>
            <select
              aria-label={t('marketSort')}
              value={sort}
              onChange={(event) => { setSort(event.currentTarget.value as SortId) }}
            >
              <option value="hot">{t('marketSortHot')}</option>
              <option value="new">{t('marketSortNew')}</option>
            </select>
            <IconChevronDownOutline14 aria-hidden="true" />
          </span>
        </label>
      </div>
      {warning ? <p className={css.banner} role="status">{warning}</p> : null}
      {busy && items.length === 0 ? <p className={css.status}>{t('marketLoading')}</p> : null}
      {!busy && visible.length === 0 && (items.length > 0 || !warning) ? <p className={css.status}>{t('marketEmpty')}</p> : null}
      {visible.length > 0 ? (
        <div className={css.masonry}>
          {[0, 1].map(column => (
            <ul key={column} className={css.masonryCol} data-market-col={column}>
              {visible.filter((_, index) => index % 2 === column).map((item) => {
                const name = installedName(item, installed)
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={css.card}
                      data-market-card={item.id}
                      aria-label={item.repo}
                      onClick={() => { setDetail(item) }}
                    >
                      <strong>{item.repo}</strong>
                      <p>{item.description || t('marketNoDescription')}</p>
                      <div className={css.tags}>
                        <span>{categoryLabel(item.category, categories, t)}</span>
                        <span>★ {starCount(item)}</span>
                        <span>{item.isBundle ? t('marketBundle') : t('marketNotBundle')}</span>
                        {name ? <span>{t('marketInstalled')}</span> : null}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          ))}
        </div>
      ) : null}
      {detail ? (
        <div className={css.dialog} role="presentation">
          <div className={css.mask} data-market-mask="" onClick={() => { setDetail(null) }} />
          <div className={css.sheet} role="dialog" aria-modal="true" aria-labelledby="dsh-market-detail-title">
            <div className={css.sheetHead}>
              <h3 id="dsh-market-detail-title">{detail.repo}</h3>
              <button type="button" className={css.close} aria-label={t('marketClose')} onClick={() => { setDetail(null) }}>
                <IconCloseOutline16 size={14} />
              </button>
            </div>
            <p className={css.lead}>{detail.description || t('marketNoDescription')}</p>
            <dl className={css.meta}>
              <div><dt>{t('marketOwner')}</dt><dd>{detail.owner}</dd></div>
              <div><dt>{t('marketPackage')}</dt><dd>{detail.packageName || '—'}</dd></div>
              <div><dt>{t('marketSpec')}</dt><dd>{detail.installSpec}</dd></div>
              {detail.license ? <div><dt>{t('marketLicense')}</dt><dd>{detail.license}</dd></div> : null}
              {updated ? <div><dt>{t('marketUpdated')}</dt><dd>{updated}</dd></div> : null}
            </dl>
            <div className={css.facts}>
              <span>{categoryLabel(detail.category, categories, t)}</span>
              <span>★ {starCount(detail)}</span>
              <span>{detail.isBundle ? t('marketBundle') : t('marketNotBundle')}</span>
              {detailName ? <span>{t('marketInstalled')}</span> : null}
            </div>
            {topics.length > 0 ? (
              <div className={css.topics}>
                {topics.map(topic => <span key={topic}>{topic}</span>)}
              </div>
            ) : null}
            <div className={css.actions}>
              {detail.isBundle && !detailName ? (
                <button type="button" disabled={busy} onClick={() => { runInstall(detail) }}>
                  {t('marketInstall')}
                </button>
              ) : null}
              {detailName ? (
                <button type="button" disabled={busy} onClick={() => { void runUninstall(detailName) }}>
                  {t('marketRemove')}
                </button>
              ) : null}
              <button type="button" onClick={() => { void openExternal(detail.homepage) }}>{t('marketRepo')}</button>
            </div>
          </div>
        </div>
      ) : null}
      {dialog ? (
        <div className={css.confirm} role="dialog" aria-modal="true" aria-labelledby="dsh-market-dialog-title">
          <div className={css.sheet}>
            <h3 id="dsh-market-dialog-title">{dialog.title}</h3>
            <p>{dialog.body}</p>
            {dialog.log || log ? <pre>{dialog.log || log}</pre> : null}
            <div className={css.actions}>
              <button type="button" onClick={() => { closeDialog(false) }}>{t('marketCancel')}</button>
              <button type="button" onClick={() => { closeDialog(true) }}>{dialog.ok}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
