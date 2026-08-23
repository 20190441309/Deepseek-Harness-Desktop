'use strict';

const { PAGE_HELPERS } = require('./release-ui-walk');

const APPENDIX_TURNS = Object.freeze([
  {
    id: 'appendix.turn1.connect',
    prompt: '用一句话回复：你已连通，并给出一个三位数验证码。',
    expect: (text) => /连通/.test(text) && /\b\d{3}\b/.test(text),
  },
  {
    id: 'appendix.turn2.recall',
    prompt: '刚才的验证码是多少？只回答数字。',
    expect: (text, ctx) => ctx.code ? text.includes(ctx.code) : /\b\d{3}\b/.test(text),
  },
  {
    id: 'appendix.turn3.readReadme',
    prompt: '阅读工作区根目录的 README 或 README.md（若存在），用三句话总结它是什么产品。',
    expect: (text) => /harness|desktop|deepseek/i.test(text),
    expectTool: true,
  },
  {
    id: 'appendix.turn4.shell',
    prompt: '在工作区执行一命令打印当前目录名，把命令输出原样贴给我。',
    expect: (text) => text.trim().length > 0,
    expectTool: true,
  },
  {
    id: 'appendix.turn5.summary',
    prompt: '汇总：验证码、产品一句话、目录名各一行。',
    expect: (text, ctx) => Boolean(ctx.code) && text.includes(ctx.code),
  },
]);

const APPENDIX_EXTRA_STEPS = Object.freeze([
  'appendix.editUser',
  'appendix.reject',
  'appendix.vision',
]);

const QA_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(probe, timeoutMs, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await sleep(intervalMs);
  }
  return last;
}

function pageEval(wc, fn) {
  return wc.executeJavaScript(`(() => { ${PAGE_HELPERS}; return (${fn.toString()})(); })()`);
}

function pageScript(wc, body, args) {
  return wc.executeJavaScript(`(() => {
    ${PAGE_HELPERS}
    const args = ${JSON.stringify(args || {})};
    ${body}
  })()`);
}

function makeRecorder(steps) {
  return (name, ok, detail) => {
    const row = {
      name,
      ok: Boolean(ok),
      detail: detail == null ? '' : String(detail).slice(0, 600),
    };
    steps.push(row);
    console.log(`[DSH_QA_APPENDIX] ${ok ? 'PASS' : 'FAIL'} ${name}${row.detail ? ` — ${row.detail}` : ''}`);
  };
}

function extractCode(text) {
  const match = String(text || '').match(/\b(\d{3})\b/);
  return match ? match[1] : '';
}

/**
 * Point the smoke copy of settings.yaml at grok-4.6 on the official DeepSeek
 * route (the desktop home used for appendix A, never ~/.dsh).
 * @param {string} yamlText
 * @returns {string}
 */
function pinAgentDefaultModel(yamlText) {
  const pinned = 'agent-default-model:\n  provider: deepseek-official\n  model: grok-4.6\n';
  if (!/^agent-default-model:/m.test(String(yamlText || ''))) {
    return `${String(yamlText || '').replace(/\s*$/, '\n')}${pinned}`;
  }
  return String(yamlText).replace(
    /^agent-default-model:\n(?:  [^\n]*\n)*/m,
    pinned,
  );
}

/**
 * Drop a copied `vision-fallback` route from the smoke home so Appendix A
 * exercises the unconfigured path (pre-send refusal on a text-only model)
 * instead of a region-blocked vision model from official ~/.dsh.
 * @param {string} yamlText
 * @returns {string}
 */
function stripVisionFallback(yamlText) {
  return String(yamlText || '').replace(/^vision-fallback:(?:\n(?:  [^\n]*)+)?\n?/m, '');
}

function chatSnapshot() {
  const flow = document.querySelector('[data-chat-flow]');
  const kinds = Array.from(document.querySelectorAll('[data-chat-flow-kind]'))
    .map((el) => el.getAttribute('data-chat-flow-kind') || '')
    .filter(Boolean);
  const nodes = Array.from(document.querySelectorAll('[data-chat-flow-kind]'));
  const assistants = Array.from(document.querySelectorAll(
    '[data-chat-flow-kind="assistant"], [data-chat-flow-kind="assistant-step"]',
  ));
  const last = assistants.at(-1) || nodes.at(-1);
  const lastText = last ? (last.innerText || '').slice(0, 1500) : '';
  const body = (flow && flow.innerText) || '';
  return {
    kinds,
    assistantCount: assistants.length,
    lastText,
    failReason: /network_error|本轮运行失败|PI_AI_ERROR/i.test(lastText + body)
      ? (lastText || body).slice(0, 240)
      : '',
    toolCall: kinds.includes('tool-call') || kinds.includes('tool-result'),
    approval: Boolean(document.querySelector('[data-approval-key]')),
    sendReady: (() => {
      const btn = dshComposerSend();
      return Boolean(btn && !btn.disabled);
    })(),
    busy: (() => {
      const card = document.querySelector('[data-composer-card]');
      const stop = card && dshFind('stop generating|停止生成', card);
      const body = (flow && flow.innerText) || '';
      return Boolean(stop) || /Deep diving|深潜/.test(body + lastText);
    })(),
    modelLabel: (() => {
      const card = document.querySelector('[data-composer-card]');
      const trigger = card && Array.from(card.querySelectorAll('button')).find((el) =>
        /选择模型|select model/i.test(dshLabel(el)));
      return trigger ? dshLabel(trigger) : '';
    })(),
  };
}

async function ensureGrokModel(wc) {
  const label = await pageEval(wc, () => {
    const card = document.querySelector('[data-composer-card]');
    const trigger = card && Array.from(card.querySelectorAll('button')).find((el) =>
      /选择模型|select model/i.test(dshLabel(el)));
    return trigger ? dshLabel(trigger) : '';
  });
  if (/grok-4\.6/i.test(label)) return label;
  await pageEval(wc, () => {
    const card = document.querySelector('[data-composer-card]');
    const trigger = card && Array.from(card.querySelectorAll('button')).find((el) =>
      /选择模型|select model/i.test(dshLabel(el)));
    if (!trigger || trigger.disabled) return false;
    trigger.click();
    return true;
  });
  await sleep(400);
  await pageEval(wc, () => {
    const modelRow = dshFind('^model$|^模型$');
    if (modelRow) modelRow.click();
    return Boolean(modelRow);
  });
  await sleep(400);
  const picked = await pageEval(wc, () => {
    const item = Array.from(document.querySelectorAll('[role="menuitemradio"], [role="menuitem"]'))
      .find((el) => dshShown(el) && /grok-4\.6/i.test(dshLabel(el)));
    if (!item || item.disabled) return false;
    item.click();
    return true;
  });
  const after = await waitUntil(async () => {
    const snap = await pageEval(wc, chatSnapshot);
    return /grok-4\.6/i.test(snap.modelLabel) ? snap.modelLabel : null;
  }, 8_000);
  return after || (picked ? 'grok-4.6' : label);
}

async function waitForIdle(wc, timeoutMs = 300_000, allowOnce = true) {
  return waitUntil(async () => {
    if (allowOnce) await clickAllowOnce(wc);
    const snap = await pageEval(wc, chatSnapshot);
    if (snap.approval || snap.busy) return null;
    return snap;
  }, timeoutMs, 400);
}

async function clickAllowOnce(wc) {
  return pageEval(wc, () => {
    const btn = dshFind('allow once|允许一次');
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  });
}

async function clickRejectOnce(wc) {
  return pageEval(wc, () => {
    const btn = dshFind('^deny$|^reject$|^拒绝$');
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  });
}

async function clickSkipQuestion(wc) {
  return pageEval(wc, () => {
    const btn = dshFind('跳过本题|skip this question');
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  });
}

async function clickStopGenerating(wc) {
  return pageEval(wc, () => {
    const btn = dshFind('stop generating|停止生成');
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  });
}

/**
 * Switch the session permission preset to read-only so a workspace write
 * must escalate through the approval panel (workspace-write echo does not).
 * @param {import('electron').WebContents} wc
 */
async function setReadOnlyAccess(wc) {
  const opened = await pageEval(wc, () => {
    const btn = dshFind('access mode|访问模式');
    if (!btn || btn.disabled) return { ok: false, reason: btn ? 'disabled' : 'no-trigger' };
    const aria = btn.getAttribute('aria-label') || '';
    if (/当前[:：]\s*仅可查看|current:\s*read only/i.test(aria) && !/可写入工作区|workspace write/i.test(aria)) {
      return { ok: true, already: true, label: aria };
    }
    btn.click();
    return { ok: true, already: false, label: aria };
  });
  if (!opened.ok || opened.already) return opened;
  await sleep(300);
  const picked = await pageEval(wc, () => {
    const items = Array.from(document.querySelectorAll('[role="menuitem"]')).filter(dshShown);
    const item = items.find((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return /^(仅可查看|read only)$/i.test(text);
    }) || dshFind('^仅可查看$|^read only$');
    if (!item) return { ok: false, reason: 'no-readonly-item' };
    item.click();
    return { ok: true, label: (item.getAttribute('aria-label') || item.textContent || '').trim().slice(0, 80) };
  });
  if (!picked.ok) return picked;
  const applied = await waitUntil(() => pageEval(wc, () => {
    const btn = dshFind('access mode|访问模式');
    const aria = (btn && btn.getAttribute('aria-label')) || '';
    return btn
      && /当前[:：]\s*仅可查看|current:\s*read only/i.test(aria)
      && !/可写入工作区|workspace write/i.test(aria)
      ? { ok: true, label: aria }
      : null;
  }), 8_000);
  return applied || { ok: false, reason: 'preset-did-not-apply' };
}

async function typePrompt(wc, prompt) {
  await pageScript(wc, `
    const ta = document.querySelector('[data-composer-card] textarea');
    if (!ta) return false;
    ta.focus();
    return dshSetValue(ta, args.prompt);
  `, { prompt });
  const written = await waitUntil(async () => {
    const value = await pageEval(wc, () => {
      const ta = document.querySelector('[data-composer-card] textarea');
      return (ta && ta.value) || '';
    });
    return value === prompt ? true : null;
  }, 4_000);
  return Boolean(written);
}

async function pressEnter(wc) {
  const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
  await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
}

async function clickSend(wc) {
  return pageEval(wc, () => {
    const btn = dshComposerSend();
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  });
}

async function runTurn(wc, turn, ctx) {
  const idle = await waitForIdle(wc, 300_000);
  if (!idle) {
    return { ok: false, detail: 'composer stayed busy before send', toolCall: false, text: '' };
  }
  const before = await pageEval(wc, chatSnapshot);
  const typed = await typePrompt(wc, turn.prompt);
  if (!typed) {
    return { ok: false, detail: 'composer did not accept the prompt', toolCall: false, text: '' };
  }
  const sendReady = await waitUntil(async () => {
    const snap = await pageEval(wc, chatSnapshot);
    return snap.sendReady && !snap.busy ? true : null;
  }, 60_000);
  if (!sendReady) {
    return { ok: false, detail: 'send stayed disabled (busy or no model)', toolCall: false, text: '' };
  }
  let sent = await clickSend(wc);
  if (!sent) {
    await pressEnter(wc);
    const cleared = await waitUntil(async () => {
      const value = await pageEval(wc, () => {
        const ta = document.querySelector('[data-composer-card] textarea');
        return (ta && ta.value) || '';
      });
      return value === '' ? true : null;
    }, 2_000);
    sent = Boolean(cleared);
  }
  if (!sent) {
    return { ok: false, detail: 'send click failed', toolCall: false, text: '' };
  }

  const done = await waitUntil(async () => {
    await clickAllowOnce(wc);
    const snap = await pageEval(wc, chatSnapshot);
    if (snap.failReason) return snap;
    if (
      snap.assistantCount > before.assistantCount
      && snap.lastText
      && !snap.approval
      && !snap.busy
    ) {
      return snap;
    }
    return null;
  }, 300_000, 500);

  if (!done) {
    const snap = await pageEval(wc, chatSnapshot);
    return {
      ok: false,
      detail: `no assistant reply (${snap.assistantCount} nodes, approval=${snap.approval})`,
      toolCall: snap.toolCall,
      text: snap.lastText,
    };
  }

  if (done.failReason) {
    return {
      ok: false,
      detail: done.failReason.replace(/\s+/g, ' ').slice(0, 240),
      toolCall: done.toolCall,
      text: done.lastText,
    };
  }

  const text = done.lastText;
  const toolOk = turn.expectTool ? Boolean(done.toolCall) : true;
  const textOk = turn.expect(text, ctx);
  return {
    ok: Boolean(toolOk && textOk),
    detail: [
      turn.expectTool ? (done.toolCall ? 'tool-card' : 'no-tool-card') : '',
      text.slice(0, 240).replace(/\s+/g, ' '),
    ].filter(Boolean).join(' | '),
    toolCall: done.toolCall,
    text,
  };
}

async function runAppendixExtras(wc, helpers) {
  const extras = [];
  const idle = await waitForIdle(wc, 300_000);
  if (!idle) {
    return APPENDIX_EXTRA_STEPS.map((name) => ({ name, ok: false, detail: 'composer stayed busy before extras' }));
  }

  const editClicked = await pageEval(wc, () => {
    const buttons = Array.from(document.querySelectorAll('button')).filter((el) =>
      dshShown(el) && /^编辑$|^edit$/i.test(dshLabel(el).trim()));
    const btn = buttons.at(-1);
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  });
  if (editClicked) {
    await sleep(400);
    const rewritten = await typePrompt(wc, '用一个词回复：已改写。');
    const sent = rewritten ? await clickSend(wc) : false;
    const done = sent
      ? await waitUntil(async () => {
        const snap = await pageEval(wc, chatSnapshot);
        if (snap.failReason) return snap;
        if (/已改写/.test(snap.lastText)) return snap;
        return null;
      }, 120_000, 500)
      : null;
    extras.push({
      name: 'appendix.editUser',
      ok: Boolean(done && !done.failReason && /已改写/.test(done.lastText || '')),
      detail: done?.failReason || (done ? done.lastText.slice(0, 120) : (editClicked ? 'edit sent but no rewrite reply' : '')),
    });
  } else {
    extras.push({
      name: 'appendix.editUser',
      ok: false,
      detail: 'no 编辑 control on user bubbles',
    });
  }

  await waitForIdle(wc, 120_000, true);
  const { existsSync } = require('node:fs');
  const path = require('node:path');
  const probeFile = helpers?.workspacePath
    ? path.join(helpers.workspacePath, 'dshd-reject-probe.txt')
    : '';
  const rejectPrompt = '当前会话是只读。请申请写入工作区权限并说明原因，获用户批准后再在工作区根目录创建文件 dshd-reject-probe.txt，内容恰好一行：dshd-reject-probe。未获批准前不要声称已写完。';
  const newSession = await pageEval(wc, () => {
    const buttons = Array.from(document.querySelectorAll('button')).filter(dshShown);
    const btn = buttons.find((el) => {
      const aria = el.getAttribute('aria-label') || '';
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return /新建会话|new session in/i.test(aria) || (text === '新会话' && /新建|new session/i.test(aria + text));
    }) || buttons.find((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return text === '新会话' || text === '新对话';
    });
    if (!btn || btn.disabled) {
      return { clicked: false, reason: btn ? 'disabled' : 'no-button' };
    }
    btn.click();
    return { clicked: true, label: dshLabel(btn).slice(0, 80) };
  });
  const switched = newSession?.clicked
    ? await waitUntil(() => pageEval(wc, () => {
      const flow = document.querySelector('[data-chat-flow]');
      const text = (flow && flow.innerText) || '';
      return /验证码|已改写/.test(text) ? null : true;
    }), 12_000)
    : false;
  if (!newSession?.clicked || !switched) {
    extras.push({
      name: 'appendix.reject',
      ok: false,
      detail: `did not open a fresh session (newSession=${newSession?.clicked ? newSession.label : newSession?.reason || 'no'}; switched=${Boolean(switched)})`,
    });
  } else {
    const access = await setReadOnlyAccess(wc);
    if (!access?.ok) {
      extras.push({
        name: 'appendix.reject',
        ok: false,
        detail: `read-only preset failed (${access?.reason || access?.label || 'unknown'})`,
      });
    } else {
      const typed = await typePrompt(wc, rejectPrompt);
      const sendReady = typed
        ? await waitUntil(async () => {
          const snap = await pageEval(wc, chatSnapshot);
          return snap.sendReady && !snap.busy ? true : null;
        }, 30_000)
        : false;
      if (sendReady) await clickSend(wc);
      const approval = await waitUntil(async () => {
        await clickSkipQuestion(wc);
        const snap = await pageEval(wc, chatSnapshot);
        if (snap.approval) return snap;
        return null;
      }, 180_000, 400);
      let rejected = false;
      if (approval) {
        rejected = await clickRejectOnce(wc);
      }
      const afterReject = await waitUntil(async () => {
        const snap = await pageEval(wc, chatSnapshot);
        if (snap.failReason) return snap;
        if (!snap.approval && /拒绝|denied|rejected|not allowed|未允许|已拒绝/i.test(snap.lastText || '')) {
          return snap;
        }
        if (!snap.approval && rejected) return snap;
        return null;
      }, 60_000, 400);
      const wroteFile = Boolean(probeFile && existsSync(probeFile));
      extras.push({
        name: 'appendix.reject',
        ok: Boolean(rejected && afterReject && !wroteFile),
        detail: rejected
          ? (wroteFile
            ? 'rejected but dshd-reject-probe.txt was written'
            : ((afterReject && afterReject.lastText) || 'rejected').slice(0, 160))
          : (approval
            ? 'reject click failed'
            : `no approval (access=${access.label || 'read-only'}; switched=${Boolean(switched)})`),
      });
    }
  }

  await clickStopGenerating(wc);
  const idleAfterReject = await waitForIdle(wc, 60_000, false);
  if (!idleAfterReject) {
    extras.push({ name: 'appendix.vision', ok: false, detail: 'composer still busy after reject' });
    return extras;
  }

  try {
    const { clipboard, nativeImage } = require('electron');
    clipboard.writeImage(nativeImage.createFromBuffer(QA_PNG));
  } catch {
    extras.push({ name: 'appendix.vision', ok: false, detail: 'clipboard writeImage failed' });
    return extras;
  }
  await pageEval(wc, () => {
    const ta = document.querySelector('[data-composer-card] textarea');
    if (ta) ta.focus();
    return Boolean(ta);
  });
  try {
    await wc.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'v',
      code: 'KeyV',
      windowsVirtualKeyCode: 86,
      nativeVirtualKeyCode: 86,
      modifiers: 2,
    });
    await wc.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'v',
      code: 'KeyV',
      windowsVirtualKeyCode: 86,
      nativeVirtualKeyCode: 86,
      modifiers: 2,
    });
  } catch (error) {
    extras.push({
      name: 'appendix.vision',
      ok: false,
      detail: `paste failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200),
    });
    return extras;
  }
  const visionGate = await waitUntil(async () => pageEval(wc, () => {
    const card = document.querySelector('[data-composer-card]');
    const attached = Boolean(card && card.querySelector('img, [data-composer-image], [data-attachment]'));
    const texts = [
      ...Array.from(document.querySelectorAll('[role="alert"], [role="status"]'))
        .map((el) => (el.innerText || '').trim()),
      card ? (card.innerText || '') : '',
    ].filter(Boolean);
    const hit = texts.find((text) => /不支持图片|does not support images/i.test(text));
    if (hit) return { refused: true, attached, text: hit.slice(0, 160) };
    if (attached) return { refused: false, attached: true, text: 'image attached' };
    return null;
  }), 8_000);
  if (visionGate?.refused) {
    extras.push({
      name: 'appendix.vision',
      ok: true,
      detail: visionGate.text || 'pre-send refusal (text-only model, no vision fallback)',
    });
    return extras;
  }
  const attached = Boolean(visionGate?.attached);
  const beforeVision = await pageEval(wc, chatSnapshot);
  await typePrompt(wc, '描述这张图里有什么。若模型不能识图，请明确拒绝并点名当前模型。');
  const visionSend = await waitUntil(async () => {
    const snap = await pageEval(wc, chatSnapshot);
    return snap.sendReady && !snap.busy ? true : null;
  }, 30_000);
  if (visionSend) await clickSend(wc);
  const vision = await waitUntil(async () => {
    await clickAllowOnce(wc);
    const toast = await pageEval(wc, () => {
      const texts = [
        ...Array.from(document.querySelectorAll('[role="alert"], [role="status"]'))
          .map((el) => (el.innerText || '').trim()),
        (() => {
          const card = document.querySelector('[data-composer-card]');
          return card ? (card.innerText || '') : '';
        })(),
      ].filter(Boolean);
      const hit = texts.find((text) => /不支持图片|does not support image/i.test(text));
      return hit ? hit.slice(0, 160) : '';
    });
    if (toast) return { lastText: toast, failReason: '', assistantCount: beforeVision.assistantCount, approval: false, busy: false };
    const snap = await pageEval(wc, chatSnapshot);
    if (snap.failReason) return snap;
    if (snap.busy || snap.approval) return null;
    if (snap.assistantCount <= beforeVision.assistantCount) return null;
    if (/Deep diving|深潜/.test(snap.lastText || '')) return null;
    if (/不支持图片|does not support image|无法查看|不能读图|识图模型|grok-4\.6|像素/i.test(snap.lastText || '')) {
      return snap;
    }
    return null;
  }, 90_000, 400);
  const visionText = (vision && vision.lastText) || '';
  const visionFailed = Boolean(vision && vision.failReason);
  extras.push({
    name: 'appendix.vision',
    ok: Boolean(!visionFailed && vision && /不支持图片|does not support images|无法查看|不能读图|识图|grok-4\.6|像素/i.test(visionText)),
    detail: visionFailed
      ? vision.failReason.slice(0, 160)
      : attached
        ? (visionText || 'image attached').slice(0, 160)
        : (visionText || 'paste did not attach an image').slice(0, 160),
  });

  return extras;
}

async function runAppendixAQa(wc, helpers) {
  const steps = [];
  const rec = makeRecorder(steps);
  const ctx = { code: '' };

  rec('appendix.workspace', Boolean(helpers?.workspaceConnected || helpers?.workspacePath), helpers?.workspacePath || '');

  const composer = await waitUntil(() => pageEval(wc, () => {
    const card = document.querySelector('[data-composer-card]');
    return card && dshShown(card) ? true : null;
  }), 20_000);
  rec('appendix.composer', Boolean(composer), composer ? '' : 'composer missing');

  if (composer) {
    const model = await ensureGrokModel(wc);
    rec('appendix.model', /grok-4\.6/i.test(model), model || 'model trigger missing');
    for (const turn of APPENDIX_TURNS) {
      const result = await runTurn(wc, turn, ctx);
      if (turn.id === 'appendix.turn1.connect' && result.text) {
        ctx.code = extractCode(result.text);
      }
      rec(turn.id, result.ok, result.detail);
      if (!result.ok) break;
    }
    const turnsOk = APPENDIX_TURNS.every((turn) => steps.some((step) => step.name === turn.id && step.ok));
    if (turnsOk) {
      try {
        const extras = await runAppendixExtras(wc, helpers);
        for (const extra of extras) rec(extra.name, extra.ok, extra.detail);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        for (const name of APPENDIX_EXTRA_STEPS) {
          if (!steps.some((step) => step.name === name)) {
            rec(name, false, detail.slice(0, 200));
          }
        }
      }
    }
  }

  const names = new Set(steps.map((step) => step.name));
  const failed = steps.filter((step) => !step.ok).map((step) => step.name);
  const missingTurns = APPENDIX_TURNS.map((turn) => turn.id).filter((id) => !names.has(id));
  const missingExtras = APPENDIX_EXTRA_STEPS.filter((id) => !names.has(id));
  return {
    ok: failed.length === 0 && missingTurns.length === 0 && missingExtras.length === 0 && names.has('appendix.composer'),
    failed: [...failed, ...missingTurns.map((id) => `${id}:missing`), ...missingExtras.map((id) => `${id}:missing`)],
    steps,
    codePresent: Boolean(ctx.code),
  };
}

function assertAppendixAQaResult(qa) {
  const required = [
    'appendix.workspace',
    'appendix.composer',
    ...APPENDIX_TURNS.map((turn) => turn.id),
    ...APPENDIX_EXTRA_STEPS,
  ];
  if (!qa || qa.ok !== true) {
    throw new Error(`In-app appendix A failed: ${(qa?.failed || []).join(', ') || 'unknown'}`);
  }
  const names = new Set((qa.steps || []).map((step) => step.name));
  const missing = required.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`In-app appendix A omitted ${missing.join(', ')}`);
  }
  const failed = (qa.steps || []).filter((step) => required.includes(step.name) && !step.ok);
  if (failed.length > 0) {
    throw new Error(`In-app appendix A failed ${failed.map((step) => step.name).join(', ')}`);
  }
}

module.exports = {
  APPENDIX_TURNS,
  APPENDIX_EXTRA_STEPS,
  runAppendixAQa,
  assertAppendixAQaResult,
  extractCode,
  pinAgentDefaultModel,
  stripVisionFallback,
};
