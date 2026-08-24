// dsh-usage-panel · CSV/JSON export builders + download helper.
// CSV cells follow RFC 4180 and are guarded against spreadsheet formula
// injection (=, +, -, @ prefixes get a leading '), and files carry a UTF-8 BOM
// so Excel detects UTF-8. Dates are the UTC day keys from the payload.
import type { DayRecord, ModelItem, Overview } from '../shared/contract.ts'

/** Guard + quote one CSV cell (RFC 4180, formula-injection-safe). */
export function csvCell(value: string | number): string {
  let text = String(value)
  if (/^[=+\-@]/.test(text)) text = "'" + text
  if (/[",\n\r]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"'
  return text
}

export function buildDailyCsv(days: DayRecord[]): string {
  const rows = ['date,total,input,output,cacheRead,cacheWrite']
  for (const d of days) {
    if (d.total <= 0) continue
    let input = 0
    let output = 0
    let cacheRead = 0
    let cacheWrite = 0
    for (const model of Object.keys(d.models)) {
      const m = d.models[model]!
      input += m.input
      output += m.output
      cacheRead += m.cacheRead
      cacheWrite += m.cacheWrite
    }
    rows.push(
      [csvCell(d.date), csvCell(d.total), csvCell(input), csvCell(output), csvCell(cacheRead), csvCell(cacheWrite)].join(','),
    )
  }
  return '\uFEFF' + rows.join('\n')
}

export function buildModelCsv(byModel: ModelItem[]): string {
  const rows = ['model,total,input,output,cacheRead,cacheWrite']
  for (const m of byModel) {
    rows.push([csvCell(m.model), csvCell(m.total), csvCell(m.input), csvCell(m.output), csvCell(m.cacheRead), csvCell(m.cacheWrite)].join(','))
  }
  return '\uFEFF' + rows.join('\n')
}

export function buildJson(overview: Overview): string {
  return JSON.stringify(overview, null, 2)
}

export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
