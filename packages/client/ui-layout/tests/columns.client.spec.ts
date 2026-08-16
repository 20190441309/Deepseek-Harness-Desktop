import { describe, expect, it } from 'vitest'
import {
  CENTER_MIN, clampWidth, computeColumns,
  DETAILS_DEFAULT, DETAILS_MIN, SIDEBAR_COLLAPSED, SIDEBAR_DEFAULT, SIDEBAR_MIN,
  SURFACES_DEFAULT, SURFACES_MAX, SURFACES_MIN, surfacesMaxForViewport,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/columns.ts'

// Numeric preference form (0 = closed); helpers keep the scenario names readable.
const open = (width: number) => width
const closed = (_width: number) => 0

describe('clampWidth', () => {
  it('clamps into the range and rounds', () => {
    expect(clampWidth(250.4, 240, 420)).toBe(250)
    expect(clampWidth(100, 240, 420)).toBe(240)
    expect(clampWidth(9999, 240, 420)).toBe(420)
  })
})

describe('computeColumns', () => {
  it('step 1: everything fits at preferred widths', () => {
    const cols = computeColumns(1920, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: 1920 - 280 - 360, details: 360, surfaces: 0 })
  })

  it('closed sidebar keeps its compact rail while closed details contribute zero width', () => {
    expect(computeColumns(1920, closed(300), closed(360)))
      .toEqual({ sidebar: SIDEBAR_COLLAPSED, center: 1920 - SIDEBAR_COLLAPSED, details: 0, surfaces: 0 })
  })

  it('preferences beyond the clamp range are clamped before solving', () => {
    const cols = computeColumns(1920, open(9999), open(1))
    expect(cols.sidebar).toBe(420)
    expect(cols.details).toBe(300)
    expect(computeColumns(1920, open(1), open(DETAILS_DEFAULT)).sidebar).toBe(SIDEBAR_MIN)
  })

  it('step 2: details shrinks first, center pinned at min', () => {
    // 280 + 360 + 640 = 1280 > 1250; details concedes to 1250-280-640 = 330.
    const cols = computeColumns(1250, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: CENTER_MIN, details: 330, surfaces: 0 })
  })

  it('boundary: exactly at the step-1/step-2 seam', () => {
    const cols = computeColumns(300 + 360 + CENTER_MIN, open(300), open(360))
    expect(cols).toEqual({ sidebar: 300, center: CENTER_MIN, details: 360, surfaces: 0 })
    const one = computeColumns(300 + 360 + CENTER_MIN - 1, open(300), open(360))
    expect(one).toEqual({ sidebar: 300, center: CENTER_MIN, details: 359, surfaces: 0 })
  })

  it('step 3: details auto-closes when its min still starves center — sidebar holds its preference', () => {
    // 280 + 300 + 640 = 1220 > 1210 → details 0; sidebar untouched: center = 1210-280 = 930.
    const cols = computeColumns(1210, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: 930, details: 0, surfaces: 0 })
  })

  it('the sidebar never concedes: center absorbs the deficit below CENTER_MIN', () => {
    // 700 < 280+640: sidebar keeps 280, center takes 420 < CENTER_MIN.
    const cols = computeColumns(700, open(SIDEBAR_DEFAULT), closed(DETAILS_DEFAULT))
    expect(cols).toEqual({ sidebar: SIDEBAR_DEFAULT, center: 420, details: 0, surfaces: 0 })
  })

  it('sidebar-closed narrow window: details concedes then auto-closes', () => {
    const fits = computeColumns(SIDEBAR_COLLAPSED + DETAILS_MIN + CENTER_MIN, closed(300), open(DETAILS_DEFAULT))
    expect(fits).toEqual({ sidebar: SIDEBAR_COLLAPSED, center: CENTER_MIN, details: DETAILS_MIN, surfaces: 0 })
    const starved = computeColumns(SIDEBAR_COLLAPSED + DETAILS_MIN + CENTER_MIN - 1, closed(300), open(DETAILS_DEFAULT))
    expect(starved).toEqual({
      sidebar: SIDEBAR_COLLAPSED,
      center: DETAILS_MIN + CENTER_MIN - 1,
      details: 0,
      surfaces: 0,
    })
  })

  it('tiny viewport: details closes, sidebar holds, center takes the remainder', () => {
    const cols = computeColumns(400, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT))
    expect(cols.details).toBe(0)
    expect(cols.sidebar).toBe(SIDEBAR_DEFAULT)
    expect(cols.center).toBe(Math.max(0, 400 - SIDEBAR_DEFAULT))
  })

  it('recovery is pure: re-widening restores preferred widths untouched', () => {
    const squeezed = computeColumns(1100, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT))
    expect(squeezed.details).toBe(0)
    const restored = computeColumns(1920, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT))
    expect(restored.details).toBe(DETAILS_DEFAULT)
    expect(restored.sidebar).toBe(SIDEBAR_DEFAULT)
  })
})

describe('computeColumns — degenerate viewports', () => {
  it('sidebar closed and viewport below CENTER_MIN: details auto-closes, center takes the rest', () => {
    // Reaches step 3's auto-close with the compact rail sidebar.
    expect(computeColumns(500, closed(300), open(DETAILS_DEFAULT)))
      .toEqual({ sidebar: SIDEBAR_COLLAPSED, center: 500 - SIDEBAR_COLLAPSED, details: 0, surfaces: 0 })
  })
})

describe('surfacesMaxForViewport', () => {
  it('returns 70% of the viewport inside SURFACES_MIN..SURFACES_MAX', () => {
    expect(surfacesMaxForViewport(1920)).toBe(1344)
    expect(surfacesMaxForViewport(100)).toBe(SURFACES_MIN)
    expect(surfacesMaxForViewport(3000)).toBe(SURFACES_MAX)
  })
})

describe('computeColumns — four-column concession', () => {
  const four = (viewport: number) =>
    computeColumns(viewport, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT), open(SURFACES_DEFAULT))

  it('wide window: all four columns open at preferred widths', () => {
    // 280 + 360 + 540 + 640 = 1820 <= 1920; center takes the remainder.
    expect(four(1920)).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      center: 1920 - SIDEBAR_DEFAULT - DETAILS_DEFAULT - SURFACES_DEFAULT,
      details: DETAILS_DEFAULT,
      surfaces: SURFACES_DEFAULT,
    })
  })

  it('narrowing shrinks surfaces first, details stays at preferred', () => {
    // 1820 > 1700; surfaces concedes to 1700-280-360-640 = 420.
    expect(four(1700)).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      center: CENTER_MIN,
      details: DETAILS_DEFAULT,
      surfaces: 420,
    })
  })

  it('further narrowing shrinks details after surfaces is at its minimum', () => {
    // surfaces already at 360; details concedes to 1600-280-360-640 = 320.
    expect(four(1600)).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      center: CENTER_MIN,
      details: 320,
      surfaces: SURFACES_MIN,
    })
  })

  it('derived-closes surfaces once details is at its minimum and center is still starved', () => {
    // 280 + 300 + 360 + 640 = 1580 > 1500 → surfaces 0; details holds min; center = 920.
    expect(four(1500)).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      center: 1500 - SIDEBAR_DEFAULT - DETAILS_MIN,
      details: DETAILS_MIN,
      surfaces: 0,
    })
  })

  it('clamps an open surfaces preference to 70% of the viewport before concession', () => {
    // 70% of 1920 = 1344; store ceiling SURFACES_MAX = 1400.
    expect(surfacesMaxForViewport(1920)).toBe(1344)
    // Sidebar 280 + details 360 + CENTER_MIN 640 leaves 640 for surfaces,
    // so concession (640) is tighter than the 70% cap (1344) and the preference (1400).
    const cols = computeColumns(1920, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT), 1400)
    expect(cols.surfaces).toBe(640) // min(1400, 1344, 640)
  })

  it('derived-closes details last; the sidebar never concedes', () => {
    // 280 + 300 + 640 = 1220 > 1210 → details 0; center = 930.
    expect(four(1210)).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      center: 1210 - SIDEBAR_DEFAULT,
      details: 0,
      surfaces: 0,
    })
  })
})
