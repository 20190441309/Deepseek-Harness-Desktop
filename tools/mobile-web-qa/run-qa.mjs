/**
 * Browser integration QA for mobile/web Phase 1 against the fake daemon.
 *
 * Runs the real SPA (app.js + all chisacode/* modules) in headless Chrome
 * with only `daemon-client.bundle.js` swapped for the in-memory fake.
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
