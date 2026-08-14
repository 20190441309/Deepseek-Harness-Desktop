// Web e2e: assembled desktop chrome on the shipped web composition —
// titlebar trailing cluster (Session log, Git, terminal + surfaces toggles)
// and the right-panel empty five-card grid. Zero model calls: a connected
// workspace unlocks the current Session so Session log mounts; Git IPC is
// absent in this lane, so the split button stays on the disabled Commit
// label. A stray stream fails loud on the open llm seam.
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/desktop-chrome', import.meta.url))
const TITLEBAR_EXPECTED = join(SNAPSHOT_DIR, 'titlebar.expected.md')
const EMPTY_EXPECTED = join(SNAPSHOT_DIR, 'empty-five-cards.expected.md')
const MODE = webSnapshotMode()

describe('web e2e: titlebar cluster and surfaces empty five cards', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    await mkdir(SNAPSHOT_DIR, { recursive: true })
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('shows Session log, Git, and two panel toggles left of the frame edge', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-desktop-chrome-titlebar'))
    const cluster = page.locator('#dsh-shell-titlebar-trailing')
    await cluster.waitFor({ timeout: 15_000 })
    const sessionLog = cluster.getByRole('button', { name: 'Session log' })
    const git = cluster.getByRole('button', { name: 'Commit' })
    const gitMenu = cluster.getByRole('button', { name: 'Git actions' })
    const terminal = cluster.getByRole('button', { name: 'Toggle terminal drawer' })
    const surfaces = cluster.getByRole('button', { name: 'Toggle right panel' })
    expect(await sessionLog.isVisible()).toBe(true)
    expect(await git.isVisible()).toBe(true)
    expect(await gitMenu.isVisible()).toBe(true)
    expect(await terminal.isVisible()).toBe(true)
    expect(await surfaces.isVisible()).toBe(true)
    const boxes = await Promise.all([
      sessionLog.boundingBox(),
      git.boundingBox(),
      terminal.boundingBox(),
      surfaces.boundingBox(),
    ])
    for (const box of boxes) expect(box).not.toBeNull()
    expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x)
    expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x)
    expect(boxes[2]!.x).toBeLessThan(boxes[3]!.x)
    const snapshot = await captureStableAria(page, '#dsh-shell-titlebar-trailing', scaffold.workspaceCwd)
    await compareOrRefreshGolden(TITLEBAR_EXPECTED, snapshot, MODE)
    expect(snapshot).toContain('Session log')
    expect(snapshot).toContain('Commit')
    expect(snapshot).toContain('Git actions')
    expect(snapshot).toContain('Toggle terminal drawer')
    expect(snapshot).toContain('Toggle right panel')
    expect(tripwire.pageErrors, tripwire.pageErrors.join('\n')).toEqual([])
  })

  it('opens the right panel on the empty five-card grid', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-desktop-chrome-surfaces'))
    const surfaces = page.getByRole('button', { name: 'Toggle right panel' })
    if (await surfaces.getAttribute('aria-pressed') !== 'true') {
      await surfaces.click()
    }
    await expect.poll(() => surfaces.getAttribute('aria-pressed'), { timeout: 10_000 }).toBe('true')
    const empty = page.locator('[data-surfaces-empty]')
    await empty.waitFor({ state: 'visible', timeout: 10_000 })
    const snapshot = await captureStableAria(page, '[data-surfaces-empty]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EMPTY_EXPECTED, snapshot, MODE)
    expect(snapshot).toContain('Open a surface')
    expect(snapshot).toContain('Browser')
    expect(snapshot).toContain('Terminal')
    expect(snapshot).toContain('Files')
    expect(snapshot).toContain('Diff')
    expect(snapshot).toContain('Agents')
    expect(tripwire.pageErrors, tripwire.pageErrors.join('\n')).toEqual([])
  })

  it('commits exactly the fixtures it reads', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['titlebar.expected.md', 'empty-five-cards.expected.md'])
  })
})
