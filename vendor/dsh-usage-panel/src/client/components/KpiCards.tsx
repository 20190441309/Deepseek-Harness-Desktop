// dsh-usage-panel · KPI cards (all-time). v0.1.0 kept three cards; the cache
// hit-rate card is the P0-② addition (data was already collected).
import type { I18n } from '../locales.ts'
import type { Locale } from '../../shared/format.ts'
import { fmtTokens, pctOf, pctFull } from '../../shared/format.ts'
import { hitRate } from '../../shared/usage.ts'
import { useCountUp } from '../hooks.ts'
import type { Overview } from '../../shared/contract.ts'
import * as React from 'react'

interface KpiCardsProps {
  overview: Overview
  i18n: I18n
}

export function KpiCards({ overview, i18n }: KpiCardsProps): JSX.Element {
  const t = i18n.t
  const locale: Locale = i18n.locale
  const allTime = overview.allTime || { totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, sessionCount: 0, byModel: [] }
  const totals = allTime.totals || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
  const total = totals.total || 0
  const inputTotal = totals.input + totals.cacheRead + totals.cacheWrite // billed input (v0.1.0)
  const top = allTime.byModel[0] || null
  const rate = hitRate(totals)
  // The session-count KPI's secondary line carries the coverage counts that
  // used to live on the standalone 统计覆盖度 card (now removed): the grand
  // total of session records (incl. empty/failed/pending) plus the split of
  // sessions that actually produced usage by delegation depth.
  const coverage = overview.coverage

  // Hooks must stay unconditional (hook-order invariant).
  const animatedTotal = useCountUp(total, 900)
  const animatedInput = useCountUp(inputTotal, 900)
  const animatedOutput = useCountUp(totals.output, 900)
  const animatedSessions = useCountUp(allTime.sessionCount, 900)
  const animatedRate = useCountUp(rate === null ? 0 : rate * 100, 900)

  return (
    <div className="dsw-ust-kpis">
      <div className="dsw-ust-kpi">
        <div className="l">{t('kpi.total')}</div>
        <div className="v">{fmtTokens(animatedTotal, locale)}</div>
        <div className="d">{t('kpi.total.detail', { input: fmtTokens(animatedInput, locale), output: fmtTokens(animatedOutput, locale) })}</div>
      </div>
      <div className="dsw-ust-kpi">
        <div className="l">{t('kpi.sessions')}</div>
        <div className="v">{String(Math.round(animatedSessions))}</div>
        <div className="d">
          {t('kpi.sessions.detail', {
            total: coverage.sessionsTotal,
            main: coverage.usageSessionsMain,
            subagent: coverage.usageSessionsSubagent,
          })}
        </div>
      </div>
      <div className="dsw-ust-kpi">
        <div className="l">{t('kpi.topModel')}</div>
        <div className="v v-sm">{top ? top.model : '—'}</div>
        <div className="d">{top ? t('kpi.topModel.detail', { pct: pctOf(top.total, total) }) : ''}</div>
      </div>
      <div className="dsw-ust-kpi">
        <div className="l">{t('kpi.hitRate')}</div>
        <div className="v v-sm">{rate === null ? '—' : pctFull(animatedRate / 100) + '%'}</div>
        <div className="d">
          {rate === null
            ? t('kpi.hitRate.none')
            : t('kpi.hitRate.detail', { read: fmtTokens(totals.cacheRead, locale), write: fmtTokens(totals.cacheWrite, locale) })}
        </div>
      </div>
    </div>
  )
}
