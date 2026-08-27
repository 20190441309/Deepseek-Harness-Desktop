/**
 * Browser integration QA for mobile/web Phase 1 + Phase 2 against the fake
 * daemon.
 *
 * Runs the real SPA (app.js + all chisacode/* modules) in headless Chrome
 * with only `daemon-client.bundle.js` swapped for the in-memory fake.
 * Phase 2 covers the Files work loop (drill-down / breadcrumb / preview /
 * path search / insert), read-only diff (uncommitted + base), and the MCP /
 * skills read-only inventories.
 *
 * Usage: node tools/mobile-web-qa/run-qa.mjs [--screenshots <dir>]
 * Requires puppeteer-core (dev-only): npm i --no-save puppeteer-core
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { startQaServer } from './server.mjs';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
const BASE = 'http://127.0.0.1:3180';
const shotDirArg = process.argv.indexOf('--screenshots');
const SHOT_DIR = shotDirArg > -1
  ? process.argv[shotDirArg + 1]
  : 'docs/qa/results/2026-08-27';

const results = [];
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    results.push(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`NOT OK - ${name}: ${error?.message || error}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function waitFor(page, fn, message, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn)) return;
    await sleep(60);
  }
  throw new Error(`timeout: ${message}`);
}

async function clickByText(page, selector, text) {
  const clicked = await page.evaluate((sel, needle) => {
    const nodes = [...document.querySelectorAll(sel)];
    const hit = nodes.find((node) => node.textContent.includes(needle) && !node.disabled);
    if (hit) {
      hit.click();
      return true;
    }
    return false;
  }, selector, text);
  assert(clicked, `no clickable "${text}" in ${selector}`);
}

async function qaCalls(page, method) {
  return page.evaluate(
    (name) => window.__qa.calls.filter((call) => call.method === name).map((call) => call.args),
    method,
  );
}

async function main() {
  const server = await startQaServer();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const consoleErrors = [];
  page.on('console', (message) => {
    const url = message.location()?.url || '';
    if (message.type() === 'error' && !message.text().includes('favicon') && !url.includes('favicon')) {
      consoleErrors.push(`${message.text()} (${url})`);
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  await mkdir(SHOT_DIR, { recursive: true });
  const shot = (name) => page.screenshot({ path: join(SHOT_DIR, `${name}.png`) });

  // —— pair —— //
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await check('配对：offer 链接进入 chat', async () => {
    await page.type('#paste', `${BASE}/#offer=QAFAKE`);
    await page.click('#paste-enter');
    await waitFor(page, () => !document.querySelector('#screen-chat').classList.contains('hidden'), 'chat visible');
  });

  // —— agent pagination + subagent rail —— //
  await page.click('#menu');
  await check('会话分页：首页 100 行 + 加载更多到 130+', async () => {
    await waitFor(page, () => document.querySelectorAll('#session-list .session').length >= 100, 'first page rendered');
    const before = await page.evaluate(() => document.querySelectorAll('#session-list .session').length);
    assert(before <= 101, `first page unexpectedly large: ${before}`);
    await clickByText(page, '#session-list .session-list-action', '加载更多会话');
    await waitFor(page, () => document.querySelectorAll('#session-list .session').length > 110, 'more sessions loaded');
    const after = await page.evaluate(() => document.querySelectorAll('#session-list .session').length);
    assert(after > 110, `expected >110 rows, got ${after}`);
    const loadMoreLeft = await page.evaluate(
      () => [...document.querySelectorAll('#session-list .session-list-action')]
        .some((node) => node.textContent.includes('加载更多')),
    );
    assert(!loadMoreLeft, 'load-more still visible after last page');
  });
  await check('子智能体：折叠在父会话下并标注', async () => {
    const child = await page.evaluate(() => {
      const row = document.querySelector('#session-list .session-row.session-child');
      return row ? row.textContent : '';
    });
    assert(child.includes('子任务'), 'child row missing');
    assert(child.includes('子智能体'), 'child row missing 子智能体 tag');
  });
  await check('归档会话不出现在主抽屉', async () => {
    const titles = await page.evaluate(
      () => [...document.querySelectorAll('#session-list .session b')].map((node) => node.textContent),
    );
    assert(!titles.includes('归档的旧会话'), 'archived agent leaked into drawer');
  });
  await shot('mobile-web-phase1-sessions');

  // —— open agent-1: rich timeline + upward pagination —— //
  await check('打开会话：tail 200 + 富渲染 + XSS 安全', async () => {
    await clickByText(page, '#session-list .session', '会话 1');
    await waitFor(page, () => document.querySelectorAll('#log > *').length > 150, 'timeline rendered');
    const state = await page.evaluate(() => ({
      rows: document.querySelectorAll('#log > *').length,
      hasOlderBtn: Boolean(document.querySelector('#log .load-older')),
      mdCode: Boolean(document.querySelector('#log .md-code')),
      mdHeading: Boolean(document.querySelector('#log .md-heading')),
      toolSummary: document.querySelector('#log .tool-summary')?.textContent || '',
      todo: Boolean(document.querySelector('#log .todo-card')),
      changes: Boolean(document.querySelector('#log .changes-card')),
      meta: [...document.querySelectorAll('#log .meta-row')].map((node) => node.textContent).join('|'),
      errorRow: Boolean(document.querySelector('#log .log-error')),
      reasoning: Boolean(document.querySelector('#log .reasoning')),
      injectedImg: Boolean(document.querySelector('#log .assistant img')),
      literalImgText: [...document.querySelectorAll('#log .assistant')]
        .some((node) => node.textContent.includes('<img src=x onerror=alert(1)>')),
      link: document.querySelector('#log .assistant a')?.href || '',
    }));
    assert(state.rows === 201, `expected 200 rows + load-older, got ${state.rows}`);
    assert(state.hasOlderBtn, 'load-older button missing');
    assert(state.mdCode && state.mdHeading, 'markdown blocks missing');
    assert(state.toolSummary.includes('npm test'), 'tool detail summary missing');
    assert(state.todo && state.changes && state.errorRow && state.reasoning, 'rich rows missing');
    assert(state.meta.includes('上下文已压缩'), 'compaction meta missing');
    assert(state.meta.includes('暂不支持的消息类型：qa_future_kind'), 'unknown-type fallback missing');
    assert(!state.injectedImg && state.literalImgText, 'raw HTML was not neutralized');
    assert(state.link === 'https://example.com/doc', 'markdown link missing');
  });
  await shot('mobile-web-phase1-timeline');

  await check('向上分页：seq 去重 + 滚动锚点保持', async () => {
    // renderLog rebuilds nodes, so the anchor is tracked by row text, not
    // node identity: the same content must stay at the same viewport offset.
    const anchor = await page.evaluate(() => {
      const log = document.querySelector('#log');
      log.scrollTop = 120;
      const row = log.children[3];
      return { text: row.textContent, offsetBefore: row.getBoundingClientRect().top };
    });
    // DOM click: puppeteer's trusted click would scrollIntoView the button
    // first and destroy the very scroll position under test.
    await page.evaluate(() => document.querySelector('#log .load-older').click());
    await waitFor(page, () => document.querySelectorAll('#log > *').length > 250, 'older entries merged');
    const after = await page.evaluate((needle) => {
      const log = document.querySelector('#log');
      const row = [...log.children].find((node) => node.textContent === needle);
      return {
        rows: document.querySelectorAll('#log > *').length,
        offsetAfter: row ? row.getBoundingClientRect().top : NaN,
        hasOlderBtn: Boolean(log.querySelector('.load-older')),
      };
    }, anchor.text);
    assert(after.rows === 262, `expected 262 deduped rows, got ${after.rows}`);
    assert(!after.hasOlderBtn, 'load-older should disappear at seq 1');
    assert(
      Math.abs(after.offsetAfter - anchor.offsetBefore) <= 2,
      `scroll anchor moved ${anchor.offsetBefore} → ${after.offsetAfter}`,
    );
  });

  // —— stick-to-bottom: stream events must not fight reading history —— //
  const emitTimelineText = (seq, text) => page.evaluate((eventSeq, eventText) => {
    window.__qa.emitStream('agent-1', {
      type: 'timeline',
      item: { type: 'assistant_message', messageId: `m${eventSeq}`, text: eventText },
    }, eventSeq);
  }, seq, text);

  await check('流事件：阅读历史时保持位置不拉底', async () => {
    const before = await page.evaluate(() => {
      const log = document.querySelector('#log');
      log.scrollTop = 300;
      return { rows: log.children.length, scrollTop: log.scrollTop };
    });
    await emitTimelineText(500, '阅读历史时到达的流事件');
    await waitFor(
      page,
      () => [...document.querySelectorAll('#log .assistant')]
        .some((node) => node.textContent.includes('阅读历史时到达的流事件')),
      'stream row appended',
    );
    const after = await page.evaluate(() => {
      const log = document.querySelector('#log');
      return { rows: log.children.length, scrollTop: log.scrollTop };
    });
    assert(after.rows === before.rows + 1, `rows ${before.rows} → ${after.rows}`);
    assert(after.scrollTop === before.scrollTop, `scrollTop yanked ${before.scrollTop} → ${after.scrollTop}`);
  });

  await check('流事件：位于底部时继续贴底', async () => {
    await page.evaluate(() => {
      const log = document.querySelector('#log');
      log.scrollTop = log.scrollHeight;
    });
    await emitTimelineText(501, '贴底时到达的流事件');
    await waitFor(
      page,
      () => [...document.querySelectorAll('#log .assistant')]
        .some((node) => node.textContent.includes('贴底时到达的流事件')),
      'bottom stream row appended',
    );
    const gap = await page.evaluate(() => {
      const log = document.querySelector('#log');
      return log.scrollHeight - log.scrollTop - log.clientHeight;
    });
    assert(gap <= 2, `log not pinned to bottom, gap ${gap}`);
  });

  // —— openSession failure: stale timeline must clear —— //
  await check('打开会话失败：清空旧内容并显示错误占位', async () => {
    await page.click('#menu');
    await page.evaluate(() => window.__qa.setFail('fetchAgentTimeline', 'timeline exploded'));
    await clickByText(page, '#session-list .session', '会话 3');
    await waitFor(
      page,
      () => Boolean(document.querySelector('#log .timeline-error')),
      'error placeholder rendered',
    );
    const view = await page.evaluate(() => ({
      rows: document.querySelector('#log').children.length,
      placeholder: document.querySelector('#log .timeline-error')?.textContent || '',
      staleAssistant: [...document.querySelectorAll('#log .assistant')].length,
      banner: document.querySelector('#banner').textContent,
      bannerHidden: document.querySelector('#banner').classList.contains('hidden'),
    }));
    assert(view.rows === 1, `stale rows still in log: ${view.rows}`);
    assert(view.staleAssistant === 0, 'previous session rows leaked under the new session');
    assert(view.placeholder.includes('载入会话失败'), `placeholder copy: ${view.placeholder}`);
    assert(view.placeholder.includes('timeline exploded'), 'daemon error text missing from placeholder');
    assert(!view.bannerHidden && view.banner.includes('timeline exploded'), 'banner missing');
  });
  await shot('mobile-web-phase3-open-failure');

  await check('打开会话失败：重试恢复时间线并清 banner', async () => {
    await clickByText(page, '#log .timeline-error button', '重试');
    await waitFor(
      page,
      () => !document.querySelector('#log .timeline-error')
        && document.querySelectorAll('#log > *').length >= 2,
      'retry recovered the timeline',
    );
    const bannerHidden = await page.evaluate(() => document.querySelector('#banner').classList.contains('hidden'));
    assert(bannerHidden, 'banner should clear after successful retry');
    // Back to 会话 1 for the downstream checks.
    await page.click('#menu');
    await clickByText(page, '#session-list .session', '会话 1');
    await waitFor(page, () => document.querySelectorAll('#log > *').length > 150, 'agent-1 reopened');
  });

  // —— slash commands —— //
  await check('斜杠命令：/ 弹出、过滤、插入', async () => {
    await page.focus('#draft');
    await page.type('#draft', '/');
    await waitFor(page, () => document.querySelectorAll('#slash-pop .slash-item').length === 3, 'popup with 3 commands');
    await page.type('#draft', 'co');
    await waitFor(page, () => document.querySelectorAll('#slash-pop .slash-item').length === 2, 'filtered to 2');
    await shot('mobile-web-phase1-slash');
    await clickByText(page, '#slash-pop .slash-item', 'commit');
    const draft = await page.evaluate(() => document.querySelector('#draft').value);
    assert(draft === '/commit ', `draft is ${JSON.stringify(draft)}`);
    const popHidden = await page.evaluate(() => document.querySelector('#slash-pop').classList.contains('hidden'));
    assert(popHidden, 'popup should close after insert');
    await page.evaluate(() => {
      const input = document.querySelector('#draft');
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  // —— model picker —— //
  await check('模型：chip 显示快照模型，切换调用 setAgentModel', async () => {
    const chip = await page.evaluate(() => document.querySelector('#model-chip').textContent);
    assert(chip.includes('ds-r3'), `chip shows ${chip}`);
    await page.click('#model-chip');
    await waitFor(page, () => document.querySelectorAll('#options .mode-row').length >= 4, 'model rows loaded');
    const current = await page.evaluate(
      () => [...document.querySelectorAll('#options .mode-row')]
        .find((row) => row.querySelector('.mode-current'))?.textContent || '',
    );
    assert(current.includes('DeepSeek R3'), `current mark on ${current}`);
    await shot('mobile-web-phase1-model');
    await clickByText(page, '#options .mode-row', 'DeepSeek R3 Mini');
    await waitFor(page, () => document.querySelector('#model-chip').textContent.includes('ds-r3-mini'), 'chip updated');
    const calls = await qaCalls(page, 'setAgentModel');
    assert(
      JSON.stringify(calls.at(-1)) === JSON.stringify(['agent-1', 'ds-r3-mini']),
      `setAgentModel args ${JSON.stringify(calls.at(-1))}`,
    );
  });
  await check('模型：daemon 拒绝时回滚并显示错误', async () => {
    await page.evaluate(() => window.__qa.setFail('setAgentModel', 'model switch rejected'));
    await clickByText(page, '#options .mode-row', 'ds-lite');
    await waitFor(page, () => !document.querySelector('#banner').classList.contains('hidden'), 'banner shown');
    const state = await page.evaluate(() => ({
      banner: document.querySelector('#banner').textContent,
      chip: document.querySelector('#model-chip').textContent,
    }));
    assert(state.banner.includes('切换模型失败'), `banner: ${state.banner}`);
    assert(state.banner.includes('model switch rejected'), 'daemon error text missing');
    assert(state.chip.includes('ds-r3-mini'), `chip rolled to ${state.chip}`);
    await page.click('#close-settings');
  });

  // —— permission actions —— //
  const emitPermission = (id, actions) => page.evaluate((requestId, list) => {
    window.__qa.emitStream('agent-1', {
      type: 'permission_requested',
      request: {
        id: requestId,
        provider: 'dsh',
        name: 'shell',
        kind: 'tool',
        title: '运行命令',
        description: 'rm -rf build',
        ...(list ? { actions: list } : {}),
      },
    });
  }, id, actions);

  await check('审批：按 daemon actions 渲染并回传 selectedActionId', async () => {
    await emitPermission('perm-1', [
      { id: 'allow-once', label: '允许一次', behavior: 'allow', variant: 'primary' },
      { id: 'allow-always', label: '本会话总是允许', behavior: 'allow' },
      { id: 'deny-hard', label: '拒绝', behavior: 'deny', variant: 'danger' },
    ]);
    await waitFor(page, () => !document.querySelector('#approval').classList.contains('hidden'), 'approval visible');
    const view = await page.evaluate(() => ({
      composerHidden: document.querySelector('#composer').classList.contains('hidden'),
      buttons: [...document.querySelectorAll('#approval-actions button')]
        .map((button) => [button.textContent, button.className]),
      command: document.querySelector('#approval-command').textContent,
    }));
    assert(view.composerHidden, 'composer should hide under approval');
    assert(view.command === 'rm -rf build', 'command text missing');
    assert(
      JSON.stringify(view.buttons) === JSON.stringify([
        ['允许一次', 'primary-btn'],
        ['本会话总是允许', 'ghost-btn'],
        ['拒绝', 'danger-btn'],
      ]),
      `buttons: ${JSON.stringify(view.buttons)}`,
    );
    await shot('mobile-web-phase1-approval');
    await clickByText(page, '#approval-actions button', '本会话总是允许');
    await waitFor(page, () => document.querySelector('#approval').classList.contains('hidden'), 'approval cleared');
    const calls = await qaCalls(page, 'respondToPermission');
    assert(
      JSON.stringify(calls.at(-1)) === JSON.stringify([
        'agent-1', 'perm-1', { behavior: 'allow', selectedActionId: 'allow-always' },
      ]),
      `respondToPermission args ${JSON.stringify(calls.at(-1))}`,
    );
    const composerBack = await page.evaluate(() => !document.querySelector('#composer').classList.contains('hidden'));
    assert(composerBack, 'composer should return after resolution');
  });

  await check('审批：无 actions 用通用允许/拒绝；跨端 resolve 清除', async () => {
    await emitPermission('perm-2', null);
    await waitFor(page, () => !document.querySelector('#approval').classList.contains('hidden'), 'approval visible');
    const labels = await page.evaluate(
      () => [...document.querySelectorAll('#approval-actions button')].map((button) => button.textContent),
    );
    assert(JSON.stringify(labels) === JSON.stringify(['拒绝', '允许一次']), `generic buttons: ${labels}`);
    await page.evaluate(() => window.__qa.emitResolved('agent-1', 'perm-2'));
    await waitFor(page, () => document.querySelector('#approval').classList.contains('hidden'), 'approval cleared remotely');
    const responded = await qaCalls(page, 'respondToPermission');
    assert(responded.length === 1, 'cross-client resolution must not call respondToPermission');
  });

  // —— per-session drafts —— //
  await check('草稿：文本随会话切换互不串', async () => {
    await page.focus('#draft');
    await page.type('#draft', '会话1的草稿');
    await page.click('#menu');
    await clickByText(page, '#session-list .session', '会话 2');
    await waitFor(page, () => document.querySelector('#draft').value === '', 'agent-2 draft empty');
    await page.focus('#draft');
    await page.type('#draft', '会话2的草稿');
    await page.click('#menu');
    await clickByText(page, '#session-list .session', '会话 1');
    await waitFor(page, () => document.querySelector('#draft').value === '会话1的草稿', 'agent-1 draft restored');
  });

  // —— subagent read-only —— //
  await check('子智能体打开为只读', async () => {
    await page.click('#menu');
    await clickByText(page, '#session-list .session-child .session', '子任务');
    await waitFor(page, () => !document.querySelector('#readonly-note').classList.contains('hidden'), 'readonly note visible');
    const view = await page.evaluate(() => ({
      note: document.querySelector('#readonly-note').textContent,
      composerHidden: document.querySelector('#composer').classList.contains('hidden'),
    }));
    assert(view.note.includes('子智能体会话（只读）'), `note: ${view.note}`);
    assert(view.composerHidden, 'composer must hide for read-only');
  });
  await shot('mobile-web-phase1-readonly');

  // —— rename / archive / delete / history —— //
  await check('重命名：daemon 确认后更新标题', async () => {
    await page.click('#menu');
    const opened = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#session-list .session-row')]
        .find((node) => node.textContent.includes('会话 5'));
      row?.querySelector('.session-more')?.click();
      return Boolean(row);
    });
    assert(opened, 'session-more for 会话 5 missing');
    await waitFor(page, () => document.querySelector('#sheet-root .sheet'), 'menu sheet open');
    await clickByText(page, '#sheet-root .sheet-item', '重命名');
    await waitFor(page, () => document.querySelector('#dialog-root .dialog input'), 'rename dialog open');
    await page.evaluate(() => {
      const input = document.querySelector('#dialog-root .dialog input');
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.type('#dialog-root .dialog input', 'QA 改名');
    await clickByText(page, '#dialog-root .dialog button', '保存');
    await waitFor(
      page,
      () => !document.querySelector('#dialog-root .dialog')
        && [...document.querySelectorAll('#session-list .session b')].some((node) => node.textContent === 'QA 改名'),
      'renamed row visible',
    );
    const calls = await qaCalls(page, 'updateAgent');
    assert(
      JSON.stringify(calls.at(-1)) === JSON.stringify(['agent-5', { name: 'QA 改名' }]),
      `updateAgent args ${JSON.stringify(calls.at(-1))}`,
    );
  });

  await check('归档：确认后行离开抽屉并进入历史', async () => {
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('#session-list .session-row')]
        .find((node) => node.textContent.includes('QA 改名'));
      row.querySelector('.session-more').click();
    });
    await clickByText(page, '#sheet-root .sheet-item', '归档');
    await waitFor(page, () => document.querySelector('#dialog-root .dialog'), 'confirm dialog');
    await clickByText(page, '#dialog-root .dialog button', '归档');
    await waitFor(
      page,
      () => ![...document.querySelectorAll('#session-list .session b')].some((node) => node.textContent === 'QA 改名'),
      'archived row left drawer',
    );
    const calls = await qaCalls(page, 'archiveAgent');
    assert(JSON.stringify(calls.at(-1)) === JSON.stringify(['agent-5']), 'archiveAgent not called');
  });

  await check('删除：daemon 失败可见且不乐观移除；成功后移除', async () => {
    await page.evaluate(() => {
      window.__qa.setFail('deleteAgent', 'db locked');
      const row = [...document.querySelectorAll('#session-list .session-row')]
        .find((node) => node.textContent.includes('会话 7'));
      row.querySelector('.session-more').click();
    });
    await clickByText(page, '#sheet-root .sheet-item', '删除');
    await waitFor(page, () => document.querySelector('#dialog-root .dialog'), 'confirm dialog');
    await clickByText(page, '#dialog-root .dialog button', '删除');
    await waitFor(
      page,
      () => document.querySelector('#dialog-root .dialog')?.textContent.includes('db locked'),
      'delete failure visible in dialog',
    );
    const stillThere = await page.evaluate(
      () => [...document.querySelectorAll('#session-list .session b')].some((node) => node.textContent === '会话 7'),
    );
    assert(stillThere, 'row must not leave the list on daemon failure');
    await clickByText(page, '#dialog-root .dialog button', '删除');
    await waitFor(
      page,
      () => !document.querySelector('#dialog-root .dialog')
        && ![...document.querySelectorAll('#session-list .session b')].some((node) => node.textContent === '会话 7'),
      'row removed after daemon success',
    );
  });

  await check('历史：列出归档会话（分页），取消归档走 refreshAgent', async () => {
    await clickByText(page, '#session-list .session-list-action', '已归档会话');
    await waitFor(
      page,
      () => document.querySelector('#sheet-root .sheet')?.textContent.includes('QA 改名'),
      'history sheet listed the newly archived row',
    );
    // The old archived agent sorts far down updated_at desc — page until found.
    for (let round = 0; round < 5; round += 1) {
      const found = await page.evaluate(
        () => document.querySelector('#sheet-root .sheet')?.textContent.includes('归档的旧会话'),
      );
      if (found) break;
      await clickByText(page, '#sheet-root .sheet-item', '加载更多');
      await waitFor(
        page,
        () => ![...document.querySelectorAll('#sheet-root .sheet-note')]
          .some((node) => node.textContent.includes('正在读取')),
        'history page settled',
      );
    }
    const hasOld = await page.evaluate(
      () => document.querySelector('#sheet-root .sheet').textContent.includes('归档的旧会话'),
    );
    assert(hasOld, 'pre-archived agent missing from paged history');
    const noteHonest = await page.evaluate(
      () => document.querySelector('#sheet-root .sheet').textContent.includes('不会恢复正在运行的任务'),
    );
    assert(noteHonest, 'history sheet must state honest unarchive semantics');
    await shot('mobile-web-phase1-history');
    await clickByText(page, '#sheet-root .sheet-item', 'QA 改名');
    await waitFor(
      page,
      () => !document.querySelector('#sheet-root .sheet')?.textContent.includes('QA 改名'),
      'unarchived row left history',
    );
    const calls = await qaCalls(page, 'refreshAgent');
    assert(JSON.stringify(calls.at(-1)) === JSON.stringify(['agent-5']), 'refreshAgent not called');
    await page.evaluate(() => document.querySelector('#sheet-root .sheet-mask')?.click());
    await waitFor(page, () => !document.querySelector('#sheet-root .sheet'), 'history sheet closed');
  });

  // —— new session with model step —— //
  await check('新会话：工作区→提供方→模式→模型，model 透传 createAgent', async () => {
    await page.evaluate(() => document.querySelector('#sheet-root .sheet-mask')?.click());
    await waitFor(page, () => !document.querySelector('#sheet-root .sheet'), 'sheets closed');
    // DOM click: the unarchive toast overlays the top strip where #menu sits.
    await page.evaluate(() => document.querySelector('#menu').click());
    await waitFor(page, () => document.querySelector('#phone').hasAttribute('data-drawer'), 'drawer open');
    await page.evaluate(() => document.querySelector('#new-session').click());
    await waitFor(page, () => document.querySelector('#sheet-root .sheet')?.textContent.includes('选择工作区'), 'workspace step');
    await clickByText(page, '#sheet-root .sheet-item', 'mobile');
    await waitFor(page, () => document.querySelector('#sheet-root .sheet')?.textContent.includes('选择提供方'), 'provider step');
    await clickByText(page, '#sheet-root .sheet-item', 'DeepSeek Harness');
    await waitFor(page, () => document.querySelector('#sheet-root .sheet')?.textContent.includes('权限模式'), 'mode step');
    await clickByText(page, '#sheet-root .sheet-item', '规划');
    await waitFor(page, () => document.querySelector('#sheet-root .sheet')?.textContent.includes('选择模型'), 'model step');
    await clickByText(page, '#sheet-root .sheet-item', 'DeepSeek R3 Mini');
    await waitFor(page, () => !document.querySelector('#sheet-root .sheet'), 'chooser closed');
    const calls = await qaCalls(page, 'createAgent');
    assert(
      JSON.stringify(calls.at(-1)) === JSON.stringify([{
        provider: 'dsh',
        cwd: '/repo/mobile',
        workspaceId: 'ws-mobile',
        modeId: 'plan',
        model: 'ds-r3-mini',
      }]),
      `createAgent args ${JSON.stringify(calls.at(-1))}`,
    );
  });

  // ════════ Phase 2：Files / Diff / MCP / Skills 工作环 ════════ //

  // The freshly created session has cwd /repo/mobile — the workspace pane
  // follows it. #open-workspace lives in the drawer; a DOM click works
  // regardless of drawer visibility.
  const openWorkspace = () => page.evaluate(() => document.querySelector('#open-workspace').click());
  const mainTab = '#options > .ws-tabs .ws-tab';
  const scopeTab = '#options .diff-scopes .ws-tab';

  // —— Diff 工作环 —— //
  await check('Diff：未提交 scope 只读文件列表 + badge + 无 Stage/保存按钮', async () => {
    await openWorkspace();
    await waitFor(page, () => document.querySelectorAll('#options .diff-file').length === 3, 'diff files rendered');
    const view = await page.evaluate(() => ({
      calls: window.__qa.calls.filter((call) => call.method === 'getCheckoutDiff').map((call) => call.args),
      rows: [...document.querySelectorAll('#options .diff-file-head')].map((head) => head.textContent),
      copy: document.querySelector('#options').textContent,
    }));
    assert(
      JSON.stringify(view.calls.at(-1)) === JSON.stringify(['/repo/mobile', { mode: 'uncommitted' }]),
      `getCheckoutDiff args ${JSON.stringify(view.calls.at(-1))}`,
    );
    assert(view.rows.some((row) => row.includes('mobile/web/app.js') && row.includes('+12 −3')), 'app.js stat missing');
    assert(view.rows.some((row) => row.includes('assets/logo.png') && row.includes('二进制')), 'binary badge missing');
    assert(view.rows.some((row) => row.includes('package-lock.json') && row.includes('文件过大')), 'too-large badge missing');
    assert(view.copy.includes('只读视图'), 'read-only copy missing');
  });
  await shot('mobile-web-phase2-diff');

  await check('Diff：hunk 展开渲染 add/remove 行', async () => {
    await clickByText(page, '#options .diff-file-head', 'mobile/web/app.js');
    await waitFor(page, () => document.querySelector('#options .diff-line.add'), 'hunk lines visible');
    const view = await page.evaluate(() => ({
      header: document.querySelector('#options .diff-line.header')?.textContent || '',
      adds: [...document.querySelectorAll('#options .diff-line.add')].map((line) => line.textContent),
      removes: [...document.querySelectorAll('#options .diff-line.remove')].map((line) => line.textContent),
    }));
    assert(view.header === '@@ -10,3 +10,4 @@', `hunk header: ${view.header}`);
    assert(view.adds.some((line) => line.includes('phase2Call();')), 'add line missing');
    assert(view.removes.some((line) => line.includes('legacyCall();')), 'remove line missing');
  });

  await check('Diff：切换 base scope 调 mode=base 并换文件集', async () => {
    await clickByText(page, scopeTab, '对比主干');
    await waitFor(
      page,
      () => [...document.querySelectorAll('#options .diff-file-head')]
        .some((head) => head.textContent.includes('docs/notes.md')),
      'base scope file rendered',
    );
    const view = await page.evaluate(() => ({
      call: window.__qa.calls.filter((c) => c.method === 'getCheckoutDiff').at(-1).args,
      row: [...document.querySelectorAll('#options .diff-file-head')].map((head) => head.textContent).join('|'),
    }));
    assert(view.call[1].mode === 'base', `expected mode base, got ${JSON.stringify(view.call)}`);
    assert(view.row.includes('新增'), 'isNew badge missing on base scope');
  });

  await check('Diff：空 diff 明确状态', async () => {
    await page.evaluate(() => {
      window.__qa.world.diff.base = { error: null, files: [] };
    });
    await clickByText(page, '#options button', '刷新');
    await waitFor(
      page,
      () => document.querySelector('#options').textContent.includes('与主干没有差异'),
      'empty base diff copy',
    );
  });

  await check('Diff：非 Git 仓库按 error code 判别', async () => {
    await page.evaluate(() => {
      window.__qa.world.diff.uncommitted = {
        error: { code: 'NOT_GIT_REPO', message: 'not a git repository' },
        files: [],
      };
    });
    await clickByText(page, scopeTab, '未提交');
    await waitFor(
      page,
      () => document.querySelector('#options').textContent.includes('不是 Git 仓库'),
      'non-git copy',
    );
  });

  await check('Diff：加载失败可见并可重试', async () => {
    await page.evaluate(() => window.__qa.setFail('getCheckoutDiff', 'git crashed'));
    await clickByText(page, scopeTab, '对比主干');
    await waitFor(
      page,
      () => document.querySelector('#options').textContent.includes('读取改动失败：git crashed'),
      'diff failure visible',
    );
    await clickByText(page, '#options button', '重试');
    await waitFor(
      page,
      () => document.querySelector('#options').textContent.includes('与主干没有差异'),
      'retry recovered to empty base diff',
    );
  });

  // —— Files 工作环 —— //
  await check('文件：根目录列表目录在前、文件带大小', async () => {
    await clickByText(page, mainTab, '文件');
    await waitFor(page, () => document.querySelectorAll('#options .file-row').length >= 6, 'root listing rendered');
    const view = await page.evaluate(() => ({
      names: [...document.querySelectorAll('#options .file-row .file-name')].map((node) => node.textContent),
      listCall: window.__qa.calls.filter((c) => c.method === 'listDirectory').at(-1).args,
      readme: [...document.querySelectorAll('#options .file-row')]
        .find((row) => row.textContent.includes('README.md'))?.textContent || '',
    }));
    assert(
      JSON.stringify(view.names) === JSON.stringify([
        'assets/', 'build/', 'src/', 'vendor/', 'data.bin', 'README.md',
      ]),
      `root order: ${JSON.stringify(view.names)}`,
    );
    assert(JSON.stringify(view.listCall) === JSON.stringify(['/repo/mobile', '']), 'listDirectory args wrong');
    assert(/\d+ B/.test(view.readme), 'file size label missing');
  });
  await shot('mobile-web-phase2-files');

  await check('文件：目录点击=导航不插入 mention', async () => {
    const draftBefore = await page.evaluate(() => document.querySelector('#draft').value);
    await clickByText(page, '#options .file-open', 'src/');
    await waitFor(
      page,
      () => [...document.querySelectorAll('#options .crumb')].some((crumb) => crumb.textContent === 'src'),
      'breadcrumb shows src',
    );
    const view = await page.evaluate(() => ({
      names: [...document.querySelectorAll('#options .file-row .file-name')].map((node) => node.textContent),
      draft: document.querySelector('#draft').value,
      settingsOpen: !document.querySelector('#settings').classList.contains('hidden'),
    }));
    assert(JSON.stringify(view.names) === JSON.stringify(['app/', 'index.js']), `src listing: ${view.names}`);
    assert(view.draft === draftBefore, 'directory click must not insert a mention');
    assert(view.settingsOpen, 'settings pane must stay open while browsing');
  });

  await check('文件：breadcrumb 返回 + 滚动位置恢复', async () => {
    await clickByText(page, '#options .crumb', '根目录');
    await waitFor(page, () => document.querySelectorAll('#options .file-row').length >= 6, 'back at root');
    await clickByText(page, '#options .file-open', 'vendor/');
    await waitFor(page, () => document.querySelectorAll('#options .file-row').length === 40, 'vendor listing');
    await page.evaluate(() => { document.querySelector('#options').scrollTop = 180; });
    await clickByText(page, '#options .crumb', '根目录');
    await waitFor(page, () => document.querySelectorAll('#options .file-row').length >= 6, 'root again');
    await clickByText(page, '#options .file-open', 'vendor/');
    await waitFor(page, () => document.querySelectorAll('#options .file-row').length === 40, 'vendor revisited');
    const scrollTop = await page.evaluate(() => document.querySelector('#options').scrollTop);
    assert(Math.abs(scrollTop - 180) <= 2, `vendor scroll restored to ${scrollTop}, expected 180`);
  });

  await check('文件：文本只读预览（无保存按钮）', async () => {
    await clickByText(page, '#options .crumb', '根目录');
    await waitFor(page, () => document.querySelectorAll('#options .file-row').length >= 6, 'root before preview');
    await clickByText(page, '#options .file-open', 'README.md');
    await waitFor(page, () => document.querySelector('#options .preview-text'), 'text preview rendered');
    const view = await page.evaluate(() => ({
      title: document.querySelector('#options .preview-title')?.textContent || '',
      text: document.querySelector('#options .preview-text')?.textContent || '',
      copy: document.querySelector('#options').textContent,
      buttons: [...document.querySelectorAll('#options button')].map((button) => button.textContent),
    }));
    assert(view.title === 'README.md', `preview title: ${view.title}`);
    assert(view.text.includes('Mobile QA repo'), 'file content missing');
    assert(view.copy.includes('只读预览'), 'read-only label missing');
    assert(!view.buttons.some((label) => /保存|写入/.test(label)), 'a save button leaked into the preview');
  });
  await shot('mobile-web-phase2-preview');

  await check('文件：插入 @路径 是显式动作并回到输入框', async () => {
    await clickByText(page, '#options button', '插入 @路径 到输入框');
    const view = await page.evaluate(() => ({
      draft: document.querySelector('#draft').value,
      settingsHidden: document.querySelector('#settings').classList.contains('hidden'),
    }));
    assert(view.draft.includes('@README.md'), `draft after insert: ${JSON.stringify(view.draft)}`);
    assert(view.settingsHidden, 'settings should close after insert');
  });

  await check('文件：图片预览走 blob URL', async () => {
    await openWorkspace();
    await waitFor(page, () => document.querySelector('#options .preview-bar'), 'preview state restored');
    await clickByText(page, '#options .preview-back', '返回');
    await waitFor(page, () => document.querySelectorAll('#options .file-row').length >= 6, 'back to root');
    await clickByText(page, '#options .file-open', 'assets/');
    await waitFor(page, () => document.querySelectorAll('#options .file-row').length === 1, 'assets listing');
    await clickByText(page, '#options .file-open', 'logo.png');
    await waitFor(page, () => document.querySelector('#options .preview-image'), 'image preview rendered');
    const src = await page.evaluate(() => document.querySelector('#options .preview-image').src);
    assert(src.startsWith('blob:'), `image src is ${src}`);
  });

  await check('文件：二进制文件明确状态', async () => {
    await clickByText(page, '#options .preview-back', '返回');
    await clickByText(page, '#options .crumb', '根目录');
    await waitFor(page, () => document.querySelectorAll('#options .file-row').length >= 6, 'root for binary');
    await clickByText(page, '#options .file-open', 'data.bin');
    await waitFor(
      page,
      () => document.querySelector('#options').textContent.includes('二进制文件'),
      'binary copy visible',
    );
  });

  await check('文件：超限文件不预览且不发 readFile', async () => {
    await clickByText(page, '#options .preview-back', '返回');
    await clickByText(page, '#options .file-open', 'build/');
    await waitFor(page, () => document.querySelectorAll('#options .file-row').length === 1, 'build listing');
    await clickByText(page, '#options .file-open', 'bundle.min.js');
    await waitFor(
      page,
      () => document.querySelector('#options').textContent.includes('文件过大'),
      'too-large copy visible',
    );
    const fetched = await page.evaluate(
      () => window.__qa.calls.some((call) => call.method === 'readFile' && call.args[1] === 'build/bundle.min.js'),
    );
    assert(!fetched, 'oversized file must not be fetched');
  });

  await check('文件：预览失败可见并可重试', async () => {
    await clickByText(page, '#options .preview-back', '返回');
    await clickByText(page, '#options .crumb', '根目录');
    await waitFor(page, () => document.querySelectorAll('#options .file-row').length >= 6, 'root for error case');
    await page.evaluate(() => window.__qa.setFail('readFile', 'disk error'));
    await clickByText(page, '#options .file-open', 'README.md');
    await waitFor(
      page,
      () => document.querySelector('#options').textContent.includes('读取失败：disk error'),
      'preview error visible',
    );
    await clickByText(page, '#options button', '重试');
    await waitFor(page, () => document.querySelector('#options .preview-text'), 'retry recovered the preview');
    await clickByText(page, '#options .preview-back', '返回');
  });

  await check('文件：路径搜索走 getDirectorySuggestions（非内容搜索）', async () => {
    await page.type('#options input.paste', 'main');
    await waitFor(
      page,
      () => [...document.querySelectorAll('#options .file-row .file-path')]
        .some((node) => node.textContent === 'src/app/main.js'),
      'search results rendered',
    );
    const view = await page.evaluate(() => ({
      call: window.__qa.calls.filter((c) => c.method === 'getDirectorySuggestions').at(-1).args[0],
      copy: document.querySelector('#options').textContent,
    }));
    assert(
      JSON.stringify(view.call) === JSON.stringify({
        query: 'main', cwd: '/repo/mobile', includeFiles: true, includeDirectories: true,
        matchMode: 'fuzzy', limit: 30,
      }),
      `suggestion args ${JSON.stringify(view.call)}`,
    );
    assert(view.copy.includes('不是内容全文搜索'), 'honest non-content-search copy missing');
  });
  await shot('mobile-web-phase2-search');

  await check('文件：搜索结果行 @ 直接插入路径', async () => {
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('#options .file-row')]
        .find((node) => node.textContent.includes('src/app/main.js'));
      row.querySelector('.file-insert').click();
    });
    const draftValue = await page.evaluate(() => document.querySelector('#draft').value);
    assert(draftValue.includes('@src/app/main.js'), `draft: ${JSON.stringify(draftValue)}`);
  });

  await check('文件：搜索结果目录点击定位到浏览器', async () => {
    await openWorkspace();
    await waitFor(page, () => document.querySelector('#options input.paste'), 'files tab restored');
    await page.evaluate(() => {
      const input = document.querySelector('#options input.paste');
      input.value = 'src';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await waitFor(
      page,
      () => [...document.querySelectorAll('#options .file-row .file-path')]
        .some((node) => node.textContent === 'src'),
      'src directory suggestion listed',
    );
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('#options .file-row')]
        .find((node) => node.querySelector('.file-path')?.textContent === 'src');
      row.querySelector('.file-open').click();
    });
    await waitFor(
      page,
      () => [...document.querySelectorAll('#options .crumb')].some((crumb) => crumb.textContent === 'src')
        && document.querySelectorAll('#options .file-row').length === 2,
      'navigated into src from search',
    );
    const query = await page.evaluate(() => document.querySelector('#options input.paste').value);
    assert(query === '', 'search query should clear after locating');
  });

  // —— MCP / Skills 只读清单 —— //
  await check('MCP：hub 标注只读清单，pane 列出状态/来源/错误', async () => {
    // DOM click: transient toasts (e.g. Git 操作的「完成」) can overlay the header strip
    // and swallow coordinate-based clicks on #settings-back.
    await page.evaluate(() => document.querySelector('#settings-back').click());
    await waitFor(page, () => document.querySelector('#settings-title').textContent === '设置', 'hub visible');
    const hubDesc = await page.evaluate(
      () => [...document.querySelectorAll('#options .link-row')]
        .find((row) => row.textContent.includes('MCP'))?.textContent || '',
    );
    assert(hubDesc.includes('只读清单 · 电脑端管理'), `MCP hub desc: ${hubDesc}`);
    await clickByText(page, '#options .link-row', 'MCP');
    await waitFor(page, () => document.querySelectorAll('#options .ext-row').length === 2, 'MCP rows rendered');
    const view = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('#options .ext-row')].map((row) => row.textContent),
      statuses: [...document.querySelectorAll('#options .ext-status')].map((node) => node.textContent),
      copy: document.querySelector('#options').textContent,
    }));
    assert(view.rows[0].includes('GitHub 工具') && view.rows[0].includes('http · 用户'), `mcp row 0: ${view.rows[0]}`);
    assert(view.rows[0].includes('1 处按会话覆盖'), 'override count missing');
    assert(view.rows[1].includes('stdio · 系统') && view.rows[1].includes('上次握手超时'), `mcp row 1: ${view.rows[1]}`);
    assert(JSON.stringify(view.statuses) === JSON.stringify(['已启用', '已全局停用']), `statuses: ${view.statuses}`);
    assert(view.copy.includes('只读清单'), 'read-only notice missing');
  });
  await shot('mobile-web-phase2-mcp');

  await check('技能：只读清单显示来源 scope 与状态', async () => {
    await page.evaluate(() => document.querySelector('#settings-back').click());
    await clickByText(page, '#options .link-row', '技能');
    await waitFor(page, () => document.querySelectorAll('#options .ext-row').length === 2, 'skill rows rendered');
    const view = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('#options .ext-row')].map((row) => row.textContent),
      copy: document.querySelector('#options').textContent,
    }));
    assert(view.rows[0].includes('release-notes') && view.rows[0].includes('项目'), `skill row 0: ${view.rows[0]}`);
    assert(view.rows[1].includes('db-migrate') && view.rows[1].includes('Claude 主目录'), `skill row 1: ${view.rows[1]}`);
    assert(view.rows[1].includes('已全局停用'), 'disabled status missing');
    assert(view.copy.includes('电脑端提示：一个技能目录无法读取'), 'payload-level error note missing');
  });
  await shot('mobile-web-phase2-skills');

  // —— Kill-list：只读契约 —— //
  await check('Kill-list：工作区两个 tab 均无 Stage/保存/放弃类按钮', async () => {
    await page.evaluate(() => document.querySelector('#settings-back').click());
    await clickByText(page, '#options .link-row', '工作区');
    await waitFor(page, () => document.querySelector('#options input.paste, #options .diff-scopes'), 'workspace pane');
    const banned = /保存|写入|Stage|Unstage|Discard|暂存|放弃/;
    const filesButtons = await page.evaluate(
      () => [...document.querySelectorAll('#options button')].map((button) => button.textContent),
    );
    assert(!filesButtons.some((label) => banned.test(label)), `banned control in files tab: ${filesButtons}`);
    await clickByText(page, mainTab, '更改');
    await waitFor(page, () => document.querySelector('#options .diff-scopes'), 'changes tab');
    const diffButtons = await page.evaluate(
      () => [...document.querySelectorAll('#options button')].map((button) => button.textContent),
    );
    assert(!diffButtons.some((label) => banned.test(label)), `banned control in changes tab: ${diffButtons}`);
  });

  await check('Kill-list：全程零 MCP/技能写调用、零文件写调用', async () => {
    const writes = await page.evaluate(() => {
      const bannedMethods = [
        'upsertAgentMcpServer', 'patchAgentMcpServerPolicy', 'deleteAgentMcpServer',
        'installAgentSkills', 'uninstallAgentSkill', 'patchAgentSkillPolicy',
        'writeFile', 'saveFile',
      ];
      return window.__qa.calls
        .filter((call) => bannedMethods.includes(call.method))
        .map((call) => call.method);
    });
    assert(writes.length === 0, `write RPCs were called: ${writes.join(', ')}`);
  });

  // —— Phase 3：多台已保存电脑 chooser（纯本地状态，放最后：要断开当前设备）—— //
  await check('已保存电脑：断开后连接页列出其它电脑（最近优先）', async () => {
    await page.evaluate(() => {
      const key = 'dsh-chisacode-device-secrets';
      const all = JSON.parse(localStorage.getItem(key) || '{}');
      all['qa-second'] = {
        deviceId: 'dev_qa2', deviceSecret: 'secret_qa2',
        daemonPublicKeyB64: 'pk2', relayEndpoint: '10.0.0.2:8411',
        savedAt: Date.now() - 86400000,
      };
      all['qa-third'] = {
        deviceId: 'dev_qa3', deviceSecret: 'secret_qa3',
        daemonPublicKeyB64: 'pk3', relayEndpoint: '10.0.0.3:8411',
        savedAt: Date.now() - 1000,
      };
      localStorage.setItem(key, JSON.stringify(all));
    });
    await page.evaluate(() => document.querySelector('#settings-back').click());
    await clickByText(page, '#options .link-row', '连接详情');
    await clickByText(page, '#options button', '断开这台设备');
    await waitFor(page, () => !document.querySelector('#screen-connect').classList.contains('hidden'), 'back on connect screen');
    const view = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('#saved-computers .saved-open')].map((row) => row.textContent),
      secrets: Object.keys(JSON.parse(localStorage.getItem('dsh-chisacode-device-secrets') || '{}')),
    }));
    // Disconnecting cleared the current pairing (qa-server); the others stay.
    assert(!view.secrets.includes('qa-server'), 'disconnect must clear the active secret');
    assert(view.rows.length === 2, `saved rows: ${JSON.stringify(view.rows)}`);
    assert(view.rows[0].includes('qa-third') && view.rows[0].includes('10.0.0.3:8411'), `newest first: ${view.rows[0]}`);
    assert(view.rows[1].includes('qa-second'), `second row: ${view.rows[1]}`);
  });
  await shot('mobile-web-phase3-saved-computers');

  await check('已保存电脑：忘记移除该台且不再列出', async () => {
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('#saved-computers .saved-row')]
        .find((node) => node.textContent.includes('qa-third'));
      row.querySelector('.saved-forget').click();
    });
    await waitFor(
      page,
      () => document.querySelectorAll('#saved-computers .saved-row').length === 1,
      'row removed after forget',
    );
    const secrets = await page.evaluate(
      () => Object.keys(JSON.parse(localStorage.getItem('dsh-chisacode-device-secrets') || '{}')),
    );
    assert(!secrets.includes('qa-third'), 'forget must clear the stored secret');
  });

  await check('已保存电脑：点选后 sticky 重连进入 chat', async () => {
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('#saved-computers .saved-row')]
        .find((node) => node.textContent.includes('qa-second'));
      row.querySelector('.saved-open').click();
    });
    await waitFor(page, () => !document.querySelector('#screen-chat').classList.contains('hidden'), 'chat visible again');
    const device = await page.evaluate(() => document.querySelector('#device-line').textContent);
    assert(device.includes('已重连 qa-second'), `device line: ${device}`);
    await waitFor(page, () => {
      const calls = window.__qa.calls.filter((call) => call.method === 'fetchAgents');
      return calls.length > 0;
    }, 'agents refetched after saved-computer reconnect');
  });

  await check('控制台：0 应用错误', async () => {
    assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`);
  });

  await browser.close();
  server.close();

  console.log(results.join('\n'));
  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
