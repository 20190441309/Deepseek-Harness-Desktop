// Web e2e scenario: latest-user-message inline edit-and-resend. Cold-seeds a
// deterministic two-turn completed transcript (zero model calls until the
// confirm), then drives the real pencil → inline editor → cancel → edit →
// send path in a real browser. The confirm's child-session turn replays one
// hand-authored override script, so the whole flow stays keyless. Pins: the
// pencil does not fork, the editor prefills and focuses, Escape cancels and
// returns focus to the pencil, send forks a child cut before the edited turn
// and submits the revised text, and the source transcript stays intact.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ReplayOverrideDoc } from '@deepseek-ai/dsh-llm-replay'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden, fixtureUserPrompts,
  launchWebScaffold, parseSeedFixture, renderSeedFixture, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/message-edit', import.meta.url))
// Borrowed read-only: this scenario needs any settled two-turn transcript, not
// a new recording (message-actions / workspace-management pattern).
const SEED = fileURLToPath(new URL('./snapshots/seeded-history/seed.jsonl', import.meta.url))
const EDITOR_EXPECTED = join(SNAPSHOT_DIR, 'editor.expected.md')
const MODE = webSnapshotMode()
const SEED_ID = 'message-edit-web-e2e'

const PROMPT = 'Use the read tool twice in one assistant message: read a.txt and b.txt. Then reply with the single word DONE and stop.'
const MID_TURN_TEXT = 'I will read both files before answering.'
const SECOND_PROMPT = 'Now give the final answer.'
const REVISED_PROMPT = 'Now answer with the single word EDITED instead.'
const REVISED_REPLY = 'EDITED-REPLY-SETTLED'

/**
 * Adapt the borrowed recording into one interrupted turn plus one ordinary
 * completed turn, so the transcript carries two settled user messages: only
 * the newest may grow the pencil, and the second is the edit target.
 * @param raw - Recorded seeded-history JSONL.
 * @returns A contiguous, closed two-turn fixture.
 */
function completedTailFixture(raw: string): string {
  const decoded = parseSeedFixture(raw)
  const kept = decoded.events.filter(event => event.seq < 101).map((event) => {
    if (event.type === 'assistant/message' && event.seq === 64) {
      const data = event.data as unknown as { content?: unknown[] }
      const content = data.content
      if (!Array.isArray(content)) throw new Error('borrowed step-one assistant message has no content')
      return {
        ...event,
        data: { ...data, content: [...content.slice(0, 1), { type: 'text', text: MID_TURN_TEXT }, ...content.slice(1)] },
      }
    }
    return event
  })
  let seq = kept.length
  let time = (kept.at(-1)?.time ?? -1) + 1
  const at = (event: Record<string, unknown>): { seq: number; time: number } & Record<string, unknown> => ({
    ...event,
    seq: seq++,
    time: time++,
  })
  const tail = [
    at({ type: 'step/end', data: { turn: 1, step: 2 } }),
    at({ type: 'turn/end', data: { turn: 1, reason: { kind: 'aborted' } } }),
    at({ type: 'turn/start', data: { turn: 2, trigger: { kind: 'message', source: { kind: 'user', rpcId: '{{rpcId}}' } } } }),
    at({ type: 'user/message', data: { content: [{ type: 'text', text: SECOND_PROMPT }], source: { kind: 'user', rpcId: '{{rpcId}}' } }, surfaceOp: 'append' }),
    at({ type: 'step/start', data: { turn: 2, step: 1 } }),
    at({ type: 'assistant/message', data: { turn: 2, step: 1, content: [{ type: 'text', text: 'DONE' }], provenance: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } }, sourceEventSeqs: [], surfaceOp: 'append' }),
    at({ type: 'step/end', data: { turn: 2, step: 1 } }),
    at({ type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } }),
  ]
  return renderSeedFixture(decoded.headerLine, [...kept, ...tail])
}

/** The child session's single replayed model call: one plain text response. */
function revisedReplyScript(): ReplayOverrideDoc {
  const chunks: StreamChunk[] = [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: REVISED_REPLY },
    { type: 'block-end', index: 0, block: { type: 'text', text: REVISED_REPLY } },
    { type: 'usage', usage: { inputTokens: 64, outputTokens: 8 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  return [{ kind: 'chunks', chunks }]
}

describe('web e2e: latest-user-message inline edit and resend', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    const replayDir = await mkdtemp(join(tmpdir(), 'dsh-message-edit-replay-'))
    const replayOverride = join(replayDir, 'replay.override.json')
    await writeFile(replayOverride, JSON.stringify(revisedReplyScript()))
    scaffold = await launchWebScaffold({
      replayFixture: join(replayDir, 'override-only.jsonl'),
      replayOverride,
    })
    const raw = completedTailFixture(await readFile(SEED, 'utf8'))
    expect(fixtureUserPrompts(raw), 'adapted seed must carry both prompts').toEqual([PROMPT, SECOND_PROMPT])
    await seedSession(scaffold, raw, SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it.skipIf(MODE === 'record')('opens the inline editor from the pencil without forking', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-message-edit-open'))
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    if (await groupRow.getAttribute('aria-expanded') !== 'true') {
      await groupRow.click()
    }
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()
    await expect.poll(() => page.getByText('DONE', { exact: true }).count(), { timeout: 15_000 }).toBe(1)

    // Exactly one pencil: the newest user message only.
    await expect.poll(() => page.getByRole('button', { name: 'Edit' }).count(), { timeout: 10_000 }).toBe(1)
    await page.getByRole('button', { name: 'Edit' }).click()

    // The bubble is now the editor: prefilled with the sent text, focused.
    const field = page.getByRole('textbox', { name: 'Edit message' })
    await field.waitFor({ timeout: 5_000 })
    expect(await field.inputValue()).toBe(SECOND_PROMPT)
    await expect.poll(() => field.evaluate(el => el === document.activeElement)).toBe(true)

    // The pencil click forked nothing: still one seeded session, no child rows.
    expect(scaffold.ctx.agents.list()).toHaveLength(1)
    await expect.poll(() => page.locator('[role="treeitem"]').count()).toBe(2)
  }, 60_000)

  it.skipIf(MODE === 'record')('matches the open-editor aria golden', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-message-edit-aria'))
    const snapshot = (await captureStableAria(page, '[class*="centerCol"]', scaffold.workspaceCwd))
      .split(SEED_ID).join('{{seededId}}')
    await compareOrRefreshGolden(EDITOR_EXPECTED, snapshot, MODE)
  })

  it.skipIf(MODE === 'record')('cancels on Escape, restores the bubble, and returns focus to the pencil', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-message-edit-cancel'))
    await page.keyboard.press('Escape')
    await expect.poll(() => page.getByRole('textbox', { name: 'Edit message' }).count(), { timeout: 5_000 }).toBe(0)
    // Static bubble is back with the original text; nothing was sent or forked.
    await expect.poll(() => page.getByText(SECOND_PROMPT, { exact: true }).count(), { timeout: 5_000 }).toBe(1)
    expect(scaffold.ctx.agents.list()).toHaveLength(1)
    // Keyboard focus landed back on the control that opened the editor.
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Edit')
  }, 30_000)

  it.skipIf(MODE === 'record')('edit + send forks a child cut before the edited turn and submits the revision', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-message-edit-send'))
    await page.getByRole('button', { name: 'Edit' }).click()
    const field = page.getByRole('textbox', { name: 'Edit message' })
    await field.waitFor({ timeout: 5_000 })
    await field.fill(REVISED_PROMPT)
    await page.keyboard.press('Enter')

    // The confirm is the first Host write: a child forked from the seed.
    await expect.poll(
      () => scaffold.ctx.agents.list().find(agent => agent.session.header.parentSession === SessionId(SEED_ID)),
      { timeout: 15_000 },
    ).toBeDefined()
    await expect.poll(() => page.locator('[role="treeitem"]').count(), { timeout: 10_000 }).toBe(3)
    // The child opened, carrying the pre-cut history but neither the edited
    // message nor its old answer; the revised turn settles from the replay.
    await expect.poll(() => page.getByText(REVISED_PROMPT, { exact: true }).count(), { timeout: 15_000 }).toBe(1)
    await expect.poll(() => page.getByText(REVISED_REPLY, { exact: true }).count(), { timeout: 20_000 }).toBe(1)
    expect(await page.getByText(SECOND_PROMPT, { exact: true }).count()).toBe(0)
    expect(await page.getByText('DONE', { exact: true }).count()).toBe(0)
    await expect.poll(() => page.getByText(MID_TURN_TEXT, { exact: true }).count(), { timeout: 10_000 }).toBe(1)
  }, 60_000)

  it.skipIf(MODE === 'record')('leaves the source session transcript untouched', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-message-edit-source'))
    // Reopen the seeded source session: fork children carry an increaseTitle
    // "(N)" suffix, so the source is the session row without one (row 0 is the
    // workspace group header).
    const rows = page.locator('[role="treeitem"]')
    const count = await rows.count()
    for (let index = 1; index < count; index += 1) {
      const row = rows.nth(index)
      const text = await row.textContent()
      if (text !== null && !/\(\d+\)/.test(text)) {
        await row.click()
        break
      }
    }
    await expect.poll(() => page.getByText(SECOND_PROMPT, { exact: true }).count(), { timeout: 15_000 }).toBe(1)
    await expect.poll(() => page.getByText('DONE', { exact: true }).count(), { timeout: 10_000 }).toBe(1)
    expect(await page.getByText(REVISED_PROMPT, { exact: true }).count()).toBe(0)
  }, 30_000)

  it.skipIf(MODE === 'record')('kept a clean console and a closed fixture inventory', async () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['editor.expected.md'])
  })
})
