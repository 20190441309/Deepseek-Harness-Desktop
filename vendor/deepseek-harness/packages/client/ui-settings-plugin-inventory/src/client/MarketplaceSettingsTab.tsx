import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  IconSearchOutline16,
  Input,
  Menu,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  InstalledPlugins,
  MarketplaceCatalog,
  MarketplaceInstallOptions,
  MarketplaceInstallResult,
  MarketplaceItem,
  MarketplaceListOptions,
  MarketplaceProgress,
} from './desktop-shell.ts'
import css from './MarketplaceSettingsTab.module.css'

const PAGE_SIZE = 60

/** Registration-side desktop callbacks used by the marketplace tab. */
export interface MarketplaceSettingsTabInjected {
  /** Read the cached or refreshed catalog; apply supplies `locale`. */
  listMarketplace: (options?: MarketplaceListOptions) => Promise<MarketplaceCatalog>
  /** Read web-profile installed packages. */
  listInstalled: () => Promise<InstalledPlugins>
  /** Install one catalog row by id. The renderer sends no spec. */
  installMarketplacePlugin: (id: string, options?: MarketplaceInstallOptions) => Promise<MarketplaceInstallResult>
  /** Remove one installed package from the web profile. */
  uninstallPlugin: (name: string) => Promise<MarketplaceInstallResult>
  /** Open a repository URL in the system browser. */
  openExternal: (url: string) => Promise<boolean>
  /** Subscribe to install log lines. */
  onProgress: (handler: (payload: MarketplaceProgress) => void) => () => void
}

/** Full component props assembled by the Settings slot renderer. */
export type MarketplaceSettingsTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.pluginInventory'>
  & InjectFace<MarketplaceSettingsTabInjected>

type SortId = 'hot' | 'new'
type StatusId = 'all' | 'installable' | 'installed'

type ActionDialog =
  | { kind: 'install-confirm'; item: MarketplaceItem }
  | { kind: 'installing'; item: MarketplaceItem }
  | { kind: 'allow-builds'; item: MarketplaceItem; allowBuilds: string[] }
  | { kind: 'uninstall'; name: string }
  | { kind: 'failure'; title: string; body: string }

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

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback
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
  listMarketplace,
  listInstalled,
  installMarketplacePlugin,
  uninstallPlugin,
  openExternal,
  onProgress,
}: MarketplaceSettingsTabProps): ReactNode {
  const [items, setItems] = useState<MarketplaceItem[]>([])
  const [categories, setCategories] = useState<MarketplaceCatalog['categories']>([])
  const [installed, setInstalled] = useState<Map<string, string>>(new Map())
  const [warning, setWarning] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState<StatusId>('all')
  const [sort, setSort] = useState<SortId>('hot')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<MarketplaceItem | null>(null)
  const [action, setAction] = useState<ActionDialog | null>(null)
  const [log, setLog] = useState('')
  const [statusOpen, setStatusOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [categoriesExpanded, setCategoriesExpanded] = useState(false)
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE)

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
    return onProgress((payload) => {
      const line = payload.line
      if (line) setLog(current => current ? `${current}\n${line}` : line)
    })
  }, [listMarketplace, listInstalled, onProgress, t])

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE)
  }, [query, category])

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

  const paged = visible.slice(0, visibleLimit)

  const failAction = (body: string, extraLog?: string): void => {
    setAction({ kind: 'failure', title: t('marketFailTitle'), body })
    if (extraLog) setLog(extraLog)
  }

  const runInstall = async (item: MarketplaceItem, allowBuilds?: string[]): Promise<void> => {
    setBusy(true)
    setAction({ kind: 'installing', item })
    try {
      const result = allowBuilds === undefined
        ? await installMarketplacePlugin(item.id)
        : await installMarketplacePlugin(item.id, { allowBuilds })
      if (result.needsAllowBuilds && allowBuilds === undefined) {
        setAction({ kind: 'allow-builds', item, allowBuilds: result.allowBuilds ?? [] })
        return
      }
      if (!result.ok) {
        failAction(result.error || t('marketFail'), result.log)
        return
      }
      setAction(null)
      await load(false)
    } catch (error: unknown) {
      failAction(messageOf(error, t('marketFail')))
    } finally {
      setBusy(false)
    }
  }

  const runUninstall = async (name: string): Promise<void> => {
    setBusy(true)
    try {
      const result = await uninstallPlugin(name)
      if (!result.ok) {
        failAction(result.error || t('marketFail'), result.log)
        return
      }
      setAction(null)
      await load(false)
    } catch (error: unknown) {
      failAction(messageOf(error, t('marketFail')))
    } finally {
      setBusy(false)
    }
  }

  const closeAction = (): void => {
    if (!busy) setAction(null)
  }

  const statusOptions = [
    ['all', t('marketStatusAll')],
    ['installable', t('marketInstallable')],
    ['installed', t('marketInstalled')],
  ] as const
  const sortOptions = [
    ['hot', t('marketSortHot')],
    ['new', t('marketSortNew')],
  ] as const
  const statusLabel = statusOptions.find(([id]) => id === status)?.[1] ?? t('marketStatusAll')
  const sortLabel = sortOptions.find(([id]) => id === sort)?.[1] ?? t('marketSortHot')

  const detailName = detail ? installedName(detail, installed) : ''
  const updated = formatDay(detail?.pushed || detail?.updated)
  const topics = [...new Set([...(detail?.topics ?? []), ...(detail?.keywords ?? [])])].filter(Boolean)

  return (
    <div className={css.section} aria-busy={busy}>
      <div className={css.toolbar}>
        <Input
          className={css.search}
          type="search"
          icon={<IconSearchOutline16 />}
          value={query}
          placeholder={t('marketSearch')}
          aria-label={t('marketSearch')}
          onChange={(event) => { setQuery(event.currentTarget.value) }}
        />
        <Button variant="outline" disabled={busy} onClick={() => { void load(true) }}>
          {t('marketRefresh')}
        </Button>
      </div>
      {(categories ?? []).length > 0 ? (
        <div className={css.categoryRow}>
          <div
            className={css.tabs}
            role="tablist"
            aria-label={t('marketCategories')}
            data-expanded={categoriesExpanded ? 'true' : undefined}
          >
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
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setCategoriesExpanded(current => !current) }}
          >
            {categoriesExpanded ? t('marketCollapseCategories') : t('marketExpandCategories')}
          </Button>
        </div>
      ) : null}
      <div className={css.controls}>
        <span className={css.control}>
          <span>{t('marketStatus')}</span>
          <Menu
            open={statusOpen}
            onClose={() => { setStatusOpen(false) }}
            items={statusOptions.map(([id, copy]) => ({ id, label: copy }))}
            selectedId={status}
            onSelect={(id) => {
              setStatus(id as StatusId)
              setStatusOpen(false)
            }}
            portal
            anchor={(
              <Button
                size="sm"
                variant="outline"
                aria-label={t('marketStatus')}
                aria-haspopup="menu"
                aria-expanded={statusOpen}
                onClick={() => {
                  setStatusOpen(current => !current)
                  setSortOpen(false)
                }}
              >
                {statusLabel}
              </Button>
            )}
          />
        </span>
        <span className={css.control}>
          <span>{t('marketSort')}</span>
          <Menu
            open={sortOpen}
            onClose={() => { setSortOpen(false) }}
            items={sortOptions.map(([id, copy]) => ({ id, label: copy }))}
            selectedId={sort}
            onSelect={(id) => {
              setSort(id as SortId)
              setSortOpen(false)
            }}
            portal
            anchor={(
              <Button
                size="sm"
                variant="outline"
                aria-label={t('marketSort')}
                aria-haspopup="menu"
                aria-expanded={sortOpen}
                onClick={() => {
                  setSortOpen(current => !current)
                  setStatusOpen(false)
                }}
              >
                {sortLabel}
              </Button>
            )}
          />
        </span>
      </div>
      {warning ? <p className={css.banner} role="status">{warning}</p> : null}
      {busy && items.length === 0 ? <p className={css.status}>{t('marketLoading')}</p> : null}
      {!busy && visible.length === 0 && (items.length > 0 || !warning) ? <p className={css.status}>{t('marketEmpty')}</p> : null}
      {paged.length > 0 ? (
        <div className={css.masonry}>
          {[0, 1].map(column => (
            <ul key={column} className={css.masonryCol} data-market-col={column}>
              {paged.filter((_, index) => index % 2 === column).map((item) => {
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
      {visible.length > visibleLimit ? (
        <div className={css.more}>
          <Button variant="outline" onClick={() => { setVisibleLimit(current => current + PAGE_SIZE) }}>
            {t('marketShowMore')}
          </Button>
        </div>
      ) : null}
      <Modal
        open={detail !== null}
        onClose={() => { if (action === null) setDetail(null) }}
        title={detail?.repo ?? ''}
        closeLabel={t('marketClose')}
        description={detail ? (detail.description || t('marketNoDescription')) : undefined}
        footer={detail ? (
          <>
            {detail.isBundle && !detailName ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => { setAction({ kind: 'install-confirm', item: detail }) }}
              >
                {t('marketInstall')}
              </Button>
            ) : null}
            {detailName ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => { setAction({ kind: 'uninstall', name: detailName }) }}
              >
                {t('marketRemove')}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => { void openExternal(detail.homepage) }}>
              {t('marketRepo')}
            </Button>
          </>
        ) : undefined}
      >
        {detail ? (
          <>
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
          </>
        ) : null}
      </Modal>
      <Modal
        open={action !== null}
        onClose={closeAction}
        title={actionTitle(action, t)}
        closeLabel={t('marketClose')}
        description={actionDescription(action, t)}
        footer={actionFooter(action, busy, t, {
          onCancel: closeAction,
          onInstall: (item) => { void runInstall(item) },
          onAllowBuilds: (item, allowBuilds) => { void runInstall(item, allowBuilds) },
          onUninstall: (name) => { void runUninstall(name) },
          onDismiss: closeAction,
        })}
      >
        {action?.kind === 'install-confirm' || action?.kind === 'installing' ? (
          <pre className={css.spec}>{action.item.installSpec}</pre>
        ) : null}
        {action?.kind === 'installing' || action?.kind === 'failure' ? (
          log ? <pre className={css.log}>{log}</pre> : null
        ) : null}
      </Modal>
    </div>
  )
}

function actionTitle(
  action: ActionDialog | null,
  t: MarketplaceSettingsTabProps['t'],
): string {
  if (action === null) return ''
  switch (action.kind) {
    case 'install-confirm':
    case 'installing':
      return t('marketInstallTitle')
    case 'allow-builds':
      return t('marketAllowBuildsTitle')
    case 'uninstall':
      return t('marketRemoveTitle')
    case 'failure':
      return action.title
  }
}

function actionDescription(
  action: ActionDialog | null,
  t: MarketplaceSettingsTabProps['t'],
): string | undefined {
  if (action === null) return undefined
  switch (action.kind) {
    case 'allow-builds':
      return t('marketAllowBuildsBody').replace('{packages}', action.allowBuilds.join(', '))
    case 'uninstall':
      return t('marketRemoveBody').replace('{name}', action.name)
    case 'failure':
      return action.body
    default:
      return undefined
  }
}

function actionFooter(
  action: ActionDialog | null,
  busy: boolean,
  t: MarketplaceSettingsTabProps['t'],
  handlers: {
    onCancel: () => void
    onInstall: (item: MarketplaceItem) => void
    onAllowBuilds: (item: MarketplaceItem, allowBuilds: string[]) => void
    onUninstall: (name: string) => void
    onDismiss: () => void
  },
): ReactNode {
  if (action === null) return undefined
  switch (action.kind) {
    case 'install-confirm':
      return (
        <>
          <Button onClick={handlers.onCancel}>{t('marketCancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => { handlers.onInstall(action.item) }}>
            {t('marketInstall')}
          </Button>
        </>
      )
    case 'installing':
      return <Button variant="primary" disabled>{t('marketInstalling')}</Button>
    case 'allow-builds':
      return (
        <>
          <Button onClick={handlers.onCancel}>{t('marketCancel')}</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => { handlers.onAllowBuilds(action.item, action.allowBuilds) }}
          >
            {t('marketAllowBuildsOk')}
          </Button>
        </>
      )
    case 'uninstall':
      return (
        <>
          <Button onClick={handlers.onCancel}>{t('marketCancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => { handlers.onUninstall(action.name) }}>
            {t('marketRemoveOk')}
          </Button>
        </>
      )
    case 'failure':
      return <Button variant="primary" onClick={handlers.onDismiss}>{t('marketOk')}</Button>
  }
}
