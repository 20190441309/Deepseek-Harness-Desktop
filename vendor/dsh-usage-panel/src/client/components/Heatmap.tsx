// dsh-usage-panel · activity heatmap (v0.1.0 port, UTC grid).
// GitHub-contribution layout: weeks as columns, weekdays as rows, quartile
// levels over non-zero days, month labels on top.
import type { DayRecord } from '../../shared/contract.ts'
import { fmtTokens, heatLevel, quartileThresholds, weekdayIndexUTC, dateCN } from '../../shared/format.ts'
import { parseDayKeyUTC, keyOfDateUTC } from '../../shared/usage.ts'
import type { I18n } from '../locales.ts'
import type { Tip } from '../hooks.ts'
import * as React from 'react'

interface HeatmapProps {
  days: DayRecord[]
  i18n: I18n
  onTip: (tip: Tip | null) => void
}

export function Heatmap({ days, i18n, onTip }: HeatmapProps): JSX.Element {
  const t = i18n.t
  const locale = i18n.locale
  const byDate: Record<string, DayRecord> = {}
  const nonzero: number[] = []
  for (const d of days) {
    byDate[d.date] = d
    if (d.total > 0) nonzero.push(d.total)
  }
  const q = quartileThresholds(nonzero)
  const levelOf = (total: number): number => heatLevel(total, q)

  const firstDay = parseDayKeyUTC(days[0]!.date)
  const lead = weekdayIndexUTC(days[0]!.date)
  const heatWeeks = Math.ceil((lead + days.length) / 7)
  const monthLabels: string[] = []
  const gridCells: JSX.Element[] = []
  let prevMonth = -1
  for (let w = 0; w < heatWeeks; w++) {
    const monday = new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth(), firstDay.getUTCDate() - lead + w * 7))
    const m = monday.getUTCMonth()
    monthLabels.push(w === 0 || m !== prevMonth ? String(m + 1) + (locale === 'zh-CN' ? '月' : '/') : '')
    prevMonth = m
    for (let r = 0; r < 7; r++) {
      const cur = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + r))
      const key = keyOfDateUTC(cur)
      const rec = byDate[key]
      if (!rec) {
        gridCells.push(<div key={key + '-blank'} className="dsw-ust-heat-cell dsw-ust-heat-blank" />)
        continue
      }
      const level = levelOf(rec.total)
      gridCells.push(
        <div
          key={key}
          className={'dsw-ust-heat-cell dsw-ust-h' + level}
          // Left-to-right entrance wipe: delay scales with the week column so
          // columns light up sequentially (~0.018s/week, 0.45s fade each).
          style={{ animationDelay: (w * 0.018).toFixed(4) + 's' }}
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            onTip({
              left: rect.left + rect.width / 2,
              top: rect.top - 6,
              title: t('heat.day', { date: dateCN(key, locale), tokens: fmtTokens(rec.total, locale) }),
              lines: [],
            })
          }}
          onMouseLeave={() => onTip(null)}
        />,
      )
    }
  }
  const weekdays = locale === 'zh-CN' ? ['一', '', '三', '', '五', '', ''] : ['M', '', 'W', '', 'F', '', '']
  const minWidth = heatWeeks * 12 + (heatWeeks - 1) * 3

  return (
    <div className="dsw-ust-card">
      <div className="dsw-ust-card-head">
        <div className="dsw-ust-card-title">
          <h3>{t('heat.title')}</h3>
          <span className="dsw-ust-card-sub">{t('heat.sub')}</span>
        </div>
        <div className="dsw-ust-heat-legend">
          <span>{t('heat.less')}</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} className={'dsw-ust-heat-swatch dsw-ust-h' + l} />
          ))}
          <span>{t('heat.more')}</span>
        </div>
      </div>
      <div className="dsw-ust-heat-wrap">
        <div className="dsw-ust-heat-weekdays">
          {weekdays.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
        <div className="dsw-ust-heat-main">
          <div className="dsw-ust-heat-months" style={{ gridTemplateColumns: 'repeat(' + heatWeeks + ', minmax(12px, 1fr))', minWidth }}>
            {monthLabels.map((m, i) => (
              <span key={i} className="dsw-ust-heat-month">
                {m}
              </span>
            ))}
          </div>
          <div className="dsw-ust-heat" style={{ gridTemplateColumns: 'repeat(' + heatWeeks + ', minmax(12px, 1fr))', minWidth }}>
            {gridCells}
          </div>
        </div>
      </div>
    </div>
  )
}
