// dsh-usage-panel · zh/en dictionaries + tiny i18n runtime.
//
// Uses the DSH locale service when available (register + bind, lookup chain
// active → zh fallback → key); otherwise falls back to a self-contained zh
// dictionary so the panel still renders in older runtimes. Host errors are
// machine-readable codes — translation happens HERE, never in the host.
import type { Locale } from '../shared/format.ts'

export const NS = 'usage-panel'

export const zhCN: Record<string, string> = {
  'nav.label': '用量统计',
  'nav.subtitle': '只读重算会话日志 · 永不写回',
  'kpi.total': 'Token 总用量',
  'kpi.total.detail': '输入 {input} · 输出 {output}',
  'kpi.sessions': '总会话数量',
  'kpi.sessions.detail': '总会话 {total} · 有用量会话：主 {main} · 子代理 {subagent}',
  'kpi.topModel': '最常用模型',
  'kpi.topModel.detail': '占比 {pct}%',
  'kpi.hitRate': '缓存命中率',
  'kpi.hitRate.detail': '读 {read} · 写 {write}',
  'kpi.hitRate.none': '暂无缓存数据',
  'heat.title': '活跃热力图',
  'heat.sub': '{month} · UTC',
  'heat.sub.fallback': 'UTC',
  'heat.monthNav': '切换月份',
  'heat.prev': '上一月',
  'heat.next': '下一月',
  'heat.less': '少',
  'heat.more': '多',
  'heat.day': '{date} · {tokens} Tokens',
  'bar.title': '每日 Token 用量',
  'bar.sub': '按模型堆叠',
  'bar.day': '{date} · 共 {tokens} Tokens',
  'donut.title': '模型用量',
  'donut.model': '模型',
  'donut.tokens': '用量',
  'donut.cap': 'Token 总用量',
  'donut.other': '其他',
  'donut.share': '占比',
  'donut.hitRate': '命中率',
  'sessions.title': '会话用量排行',
  'sessions.sub': '按全部历史用量',
  'sessions.untitled': '未命名会话',
  'sessions.main': '主会话',
  'sessions.subagent': '子代理',
  'sessions.tokens': '{tokens} Tokens',
  'sessions.lastActive': '最近活跃 {date}',
  'providers.title': '服务商用量',
  'export.button': '导出',
  'export.json': '导出 JSON',
  'export.daily': '导出每日 CSV',
  'export.models': '导出模型 CSV',
  'export.file.daily': 'dsh-usage-panel-daily.csv',
  'export.file.models': 'dsh-usage-panel-models.csv',
  'export.file.json': 'dsh-usage-panel-overview.json',
  'refresh.button': '刷新',
  'refresh.loading': '刷新中…',
  'refresh.title': '重新拉取最新统计',
  'status.loading': '正在统计会话日志…',
  'status.loading.hint': '插件加载时已开始预热，通常只需等待片刻',
  'status.fresh': '数据更新于 {time} · UTC',
  'status.stale': '数据更新于 {time} · 后台更新中…',
  'status.fallback': '显示缓存数据（更新失败于 {time}）',
  'status.error': '加载失败：{msg}',
  'empty.title': '暂无统计数据',
  'empty.hint': '开始使用 DeepSeek Harness 后，这里会展示 Token 消耗情况',
  'error.title': '统计面板崩溃了',
  'error.reset': '清空缓存并重试',
  'error.detail': '错误信息：{msg}',
  'unit.tokens': '{n} Tokens',
  'date.today': '今天',
}

export const enUS: Record<string, string> = {
  'nav.label': 'Usage stats',
  'nav.subtitle': 'Read-only session log stats · never writes back',
  'kpi.total': 'Total tokens',
  'kpi.total.detail': 'In {input} · Out {output}',
  'kpi.sessions': 'Sessions',
  'kpi.sessions.detail': 'Total {total} · with usage: main {main} · subagent {subagent}',
  'kpi.topModel': 'Top model',
  'kpi.topModel.detail': 'Share {pct}%',
  'kpi.hitRate': 'Cache hit rate',
  'kpi.hitRate.detail': 'Read {read} · Write {write}',
  'kpi.hitRate.none': 'No cache data yet',
  'heat.title': 'Activity heatmap',
  'heat.sub': '{month} · UTC',
  'heat.sub.fallback': 'UTC',
  'heat.monthNav': 'Switch month',
  'heat.prev': 'Previous month',
  'heat.next': 'Next month',
  'heat.less': 'Less',
  'heat.more': 'More',
  'heat.day': '{date} · {tokens} tokens',
  'bar.title': 'Daily token usage',
  'bar.sub': 'Stacked by model',
  'bar.day': '{date} · {tokens} tokens total',
  'donut.title': 'Model usage',
  'donut.model': 'Model',
  'donut.tokens': 'Tokens',
  'donut.cap': 'Total tokens',
  'donut.other': 'Other',
  'donut.share': 'Share',
  'donut.hitRate': 'Hit rate',
  'sessions.title': 'Top sessions',
  'sessions.sub': 'By all-time usage',
  'sessions.untitled': 'Untitled session',
  'sessions.main': 'Main',
  'sessions.subagent': 'Subagent',
  'sessions.tokens': '{tokens} tokens',
  'sessions.lastActive': 'Active {date}',
  'providers.title': 'Providers',
  'export.button': 'Export',
  'export.json': 'Export JSON',
  'export.daily': 'Export daily CSV',
  'export.models': 'Export model CSV',
  'export.file.daily': 'dsh-usage-panel-daily.csv',
  'export.file.models': 'dsh-usage-panel-models.csv',
  'export.file.json': 'dsh-usage-panel-overview.json',
  'refresh.button': 'Refresh',
  'refresh.loading': 'Refreshing…',
  'refresh.title': 'Fetch the latest statistics',
  'status.loading': 'Scanning session logs…',
  'status.loading.hint': 'A warm-up scan started when the plugin loaded; this usually takes a moment',
  'status.fresh': 'Updated at {time} · UTC',
  'status.stale': 'Updated at {time} · refreshing in background…',
  'status.fallback': 'Showing cached data (last refresh failed at {time})',
  'status.error': 'Failed to load: {msg}',
  'empty.title': 'No statistics yet',
  'empty.hint': 'Start using DeepSeek Harness and token usage will show up here',
  'error.title': 'The usage panel crashed',
  'error.reset': 'Clear cache and retry',
  'error.detail': 'Error: {msg}',
  'unit.tokens': '{n} tokens',
  'date.today': 'Today',
}

export const dictionaries: Record<string, Record<string, string>> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

export interface I18n {
  t(key: string, params?: Record<string, string | number>): string
  locale: Locale
  subscribe(cb: () => void): () => void
  getSnapshot(): Locale
  /** Re-read the active locale; called by the caller on 'locale/change'. */
  update(): void
  /** Release runtime subscriptions (plugin dispose). */
  dispose(): void
}

export interface LocaleRuntimeLike {
  /**
   * DSH locale ids are `'zh'` / `'en'` (LOCALE_IDS) — NOT 'zh-CN'/'en-US'.
   * Object form mirrors the framework's own registration convention.
   */
  register(ns: string, dicts: Record<string, Record<string, string>>): () => void
  bind(ns: string): (key: string, params?: Record<string, unknown>) => string
  getSnapshot(): { active: string }
  /** LocaleFace subscribe: fires on locale switches AND dict registrations. */
  subscribe?(fn: () => void): () => void
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params[name]
    return v === undefined ? '{' + name + '}' : String(v)
  })
}

const DICTS: Record<Locale, Record<string, string>> = { 'zh-CN': zhCN, 'en-US': enUS }

function lookup(locale: Locale, key: string): string {
  const dict = DICTS[locale]
  if (dict && dict[key]) return dict[key]
  return DICTS['zh-CN']![key] || key
}

/** Build the i18n instance; uses the DSH locale runtime when present. */
export function createI18n(runtime?: LocaleRuntimeLike): I18n {
  if (!runtime) {
    return {
      t: (key, params) => interpolate(lookup('zh-CN', key), params),
      locale: 'zh-CN',
      subscribe: () => () => {},
      getSnapshot: () => 'zh-CN',
      update: () => {},
      dispose: () => {},
    }
  }
  const rt = runtime // const narrowing survives into closures
  const listeners = new Set<() => void>()
  let active: Locale = normalizeLocale(rt.getSnapshot().active)
  try {
    rt.register(NS, { zh: zhCN, en: enUS })
  } catch {
    // Best-effort: local dictionaries remain the fallback either way.
  }
  const translated = rt.bind(NS)
  const resolve = (key: string, params?: Record<string, string | number>): string => {
    let text: string | undefined
    try {
      // No params here: the runtime fails loud by returning the KEY ITSELF,
      // and interpolation is our single source below.
      text = translated(key)
    } catch {
      text = undefined
    }
    // A truthy-but-unresolved key must NOT bypass the local dictionary.
    if (!text || text === key) text = lookup(active, key)
    return interpolate(text, params)
  }
  function update(): void {
    const next = normalizeLocale(rt.getSnapshot().active)
    if (next !== active) {
      active = next
      for (const cb of listeners) cb()
    }
  }
  // Ride the runtime's own snapshot subscription: covers locale switches AND
  // late dictionary registrations (both bump its revision).
  const disposeRuntimeSub = rt.subscribe ? rt.subscribe(update) : null
  return {
    t: resolve,
    // Getter: `locale` must track switches (the field itself would be a
    // creation-time snapshot).
    get locale(): Locale {
      return active
    },
    subscribe: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getSnapshot: () => active,
    update,
    dispose: () => {
      if (disposeRuntimeSub) disposeRuntimeSub()
    },
  }
}

export function normalizeLocale(id: string): Locale {
  return id && id.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
}
