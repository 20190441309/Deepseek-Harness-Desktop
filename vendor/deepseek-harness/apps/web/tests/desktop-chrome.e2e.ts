// Web e2e: assembled desktop chrome on the shipped web composition —
// titlebar trailing cluster (Session log, Git, terminal + surfaces toggles)
// and the right-panel empty five-card grid. Zero model calls: a connected
// workspace unlocks the current Session so Session log mounts; Git IPC is
// absent in this lane, so the split button stays on the disabled Commit
// label. A stray stream fails loud on the open llm seam.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

describe('web e2e: titlebar cluster and surfaces empty five cards', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
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
    await expect(sessionLog).toBeVisible()
    await expect(git).toBeVisible()
    await expect(gitMenu).toBeVisible()
    await expect(terminal).toBeVisible()
    await expect(surfaces).toBeVisible()
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
    expect(tripwire.pageErrors, tripwire.pageErrors.join('\n')).toEqual([])
  })

  it('opens the right panel on the empty five-card grid', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-desktop-chrome-surfaces'))
    const surfaces = page.getByRole('button', { name: 'Toggle right panel' })
    await surfaces.click()
    await expect(surfaces).toHaveAttribute('aria-pressed', 'true')
    const empty = page.locator('[data-surfaces-empty]')
    await empty.waitFor({ timeout: 10_000 })
    await expect(empty.getByRole('heading', { name: 'Open a surface' })).toBeVisible()
    for (const name of ['Browser', 'Terminal', 'Files', 'Diff', 'Agents'] as const) {
      await expect(empty.getByRole('button', { name })).toBeVisible()
    }
    expect(tripwire.pageErrors, tripwire.pageErrors.join('\n')).toEqual([])
  })
})
