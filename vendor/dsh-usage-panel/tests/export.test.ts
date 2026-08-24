// Locks the CSV/JSON export builders: formula-injection guard (=, +, -, @),
// RFC 4180 quoting, UTF-8 BOM, and stable column shapes (P1-⑧).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyCsv, buildModelCsv, buildJson, csvCell } from '../src/client/export.ts'
import type { DayRecord, ModelItem, Overview } from '../src/shared/contract.ts'

test('csvCell guards formula injection with a leading apostrophe', () => {
  assert.equal(csvCell('=SUM(A1:A9)'), "'=SUM(A1:A9)")
  assert.equal(csvCell('+123'), "'+123")
  assert.equal(csvCell('-1+1'), "'-1+1")
  assert.equal(csvCell('@cmd'), "'@cmd")
  assert.equal(csvCell('normal'), 'normal')
  assert.equal(csvCell(42), '42')
})

test('csvCell quotes per RFC 4180', () => {
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('a"b'), '"a""b"')
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"')
  assert.equal(csvCell('safe'), 'safe')
})

test('buildDailyCsv has BOM, header and per-day rows', () => {
  const days: DayRecord[] = [
    { date: '2026-08-15', total: 0, models: {} },
    {
      date: '2026-08-14',
      total: 30,
      models: {
        'model-a': { input: 10, output: 5, cacheRead: 3, cacheWrite: 2, total: 20 },
        'model-b': { input: 10, output: 0, cacheRead: 0, cacheWrite: 0, total: 10 },
      },
    },
  ]
  const csv = buildDailyCsv(days)
  assert.ok(csv.startsWith('\uFEFF'), 'must start with BOM')
  const lines = csv.slice(1).split('\n')
  assert.equal(lines[0], 'date,total,input,output,cacheRead,cacheWrite')
  assert.equal(lines[1], '2026-08-14,30,20,5,3,2')
  assert.equal(lines.length, 2, 'zero-total day is skipped')
})

test('buildModelCsv rows are formula-guarded and ordered as given', () => {
  const byModel: ModelItem[] = [
    { model: '=EVIL', total: 10, input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
    { model: 'safe', total: 5, input: 0, output: 5, cacheRead: 0, cacheWrite: 0 },
  ]
  const csv = buildModelCsv(byModel)
  assert.ok(csv.startsWith('\uFEFF'))
  const lines = csv.slice(1).split('\n')
  assert.equal(lines[0], 'model,total,input,output,cacheRead,cacheWrite')
  assert.equal(lines[1], "'=EVIL,10,1,2,3,4")
})

test('buildJson round-trips the overview payload', () => {
  const overview: Overview = {
    days: [],
    totals: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
    sessionCount: 1,
    byModel: [],
    allTime: { totals: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 }, sessionCount: 1, byModel: [] },
    coverage: {
      mode: 'scan',
      timezone: 'UTC',
      sessionsTotal: 1,
      sessionsOk: 1,
      sessionsFailed: 0,
      sessionsPending: 0,
      eventsCounted: 3,
      retries: 0,
      compactionTokens: 0,
      from: 1,
      to: 2,
    },
    topSessions: [],
    providers: [],
    updatedAt: 123,
  }
  const parsed = JSON.parse(buildJson(overview)) as Overview
  assert.equal(parsed.totals.total, 10)
  assert.equal(parsed.coverage.sessionsTotal, 1)
})
