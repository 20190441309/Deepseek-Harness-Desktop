'use strict';

const { buildSettingsSectionScript } = require('./settings-jump');

/**
 * In-page helpers for the Electron release walk. Kept as a string so
 * executeJavaScript can eval them without a Node closure.
 */
const PAGE_HELPERS = `
function dshShown(el) {
  if (!el) return false;
  if (el.closest('[aria-hidden="true"]')) return false;
  const box = el.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none';
}
function dshLabel(el) {
  return ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || ''))
    .replace(/\\s+/g, ' ').trim();
}
function dshFind(pattern, root) {
  const re = new RegExp(pattern, 'i');
  const scope = root || document;
  return Array.from(scope.querySelectorAll(
    'button, [role="button"], [role="menuitem"], [role="tab"], [role="searchbox"], [role="textbox"], input, textarea, a'
  )).find((el) => dshShown(el) && re.test(dshLabel(el))) || null;
}
function dshSetValue(el, value) {
  if (!el) return false;
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) return false;
  const tracker = el._valueTracker;
  if (tracker) tracker.setValue('');
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
function dshDialog() {
  return Array.from(document.querySelectorAll('[role="dialog"]')).find(dshShown) || null;
}
function dshDialogNamed(pattern) {
  const re = new RegExp(pattern, 'i');
  return Array.from(document.querySelectorAll('[role="dialog"]')).filter(dshShown).find((el) => {
    const labelled = el.getAttribute('aria-labelledby');
    const title = labelled ? ((document.getElementById(labelled) && document.getElementById(labelled).textContent) || '') : '';
    const aria = el.getAttribute('aria-label') || '';
    return re.test(aria) || re.test(title);
  }) || null;
}
function dshHeading(pattern, root) {
  const re = new RegExp(pattern, 'i');
  const scope = root || document;
  return Array.from(scope.querySelectorAll('h1, h2, h3')).find((el) =>
    dshShown(el) && re.test((el.textContent || '').trim())) || null;
}
`;

const QA_REQUIRED_STEPS = [
  'workspace.picker',
  'workspace.connected',
  'frame.fourColumn',
  'composer.card',
  'composer.textarea',
  'composer.commands',
  'composer.send',
  'composer.access',
  'composer.skillMenuAbsent',
  'composer.pathSourceAbsent',
  'remote.unavailable',
  'remote.notListening',
  'titlebar.sessionLog',
  'titlebar.branch',
  'titlebar.commit',
  'titlebar.git',
  'titlebar.terminal',
  'titlebar.surfaces',
  'titlebar.branchMenu',
  'titlebar.gitMenu',
  'terminal.drawer',
  'terminal.new',
  'surfaces.open',
  'files.panel',
  'files.search',
  'files.readme',
  'files.note',
  'files.mentionVisible',
  'files.mentionAppended',
  'agents.panel',
  'agents.empty',
  'diff.panel',
  'browser.panel',
  'browser.url',
  'terminal.surface',
  'settings.trigger',
  'appearance.choose',
  'appearance.browse',
  'appearance.noSourceDump',
  'gallery.dialog',
  'gallery.sources',
  'gallery.addSource',
  'mcp.heading',
  'mcp.search',
  'mcp.add',
  'skills.heading',
  'skills.add',
  'plugins.heading',
  'market.section',
  'market.discover',
  'market.installed',
  'plugin.dshbot.tab',
  'plugin.dshbot.page',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(probe, timeoutMs, intervalMs = 200) {
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

function clickNamed(wc, pattern, rootSelector) {
  return pageScript(wc, `
    const root = args.rootSelector ? document.querySelector(args.rootSelector) : document;
    const el = dshFind(args.pattern, root || document);
    if (!el || el.disabled) return false;
    el.click();
    return true;
  `, { pattern, rootSelector: rootSelector || null });
}

async function pressEnter(wc) {
  const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
  await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
}

function makeRecorder(steps) {
  return (name, ok, detail, optional = false) => {
    const row = {
      name,
      ok: Boolean(ok),
      detail: detail == null ? '' : String(detail).slice(0, 400),
    };
    if (optional) row.optional = true;
    steps.push(row);
    console.log(`[DSH_QA] ${ok ? 'PASS' : (optional ? 'SKIP' : 'FAIL')} ${name}${row.detail ? ` — ${row.detail}` : ''}`);
  };
}

/**
 * Connect the configured desktop workspace through the in-app directory picker.
 *
 * @param {Electron.WebContents} wc
 * @param {{ workspacePath: string, pressEscape: Function }} helpers
 * @param {(name: string, ok: boolean, detail?: string, optional?: boolean) => void} rec
 */
async function connectConfiguredWorkspace(wc, helpers, rec) {
  const workspacePath = helpers.workspacePath;
  rec('workspace.path', Boolean(workspacePath), workspacePath || 'missing', true);
  if (!workspacePath) {
    rec('workspace.connected', false, 'helpers.workspacePath missing');
    return false;
  }

  const clicked = await clickNamed(wc, '^add workspace$|^添加工作区$');
  rec('workspace.addClicked', Boolean(clicked), '', true);
  await sleep(300);
  await pageEval(wc, () => {
    const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((el) =>
      dshShown(el) && /add workspace|添加工作区/i.test(dshLabel(el)));
    if (!item) return false;
    item.click();
    return true;
  });

  const picker = await waitUntil(() => pageEval(wc, () =>
    Boolean(dshDialogNamed('select workspace directory|选择工作区目录'))), 10_000);
  rec('workspace.picker', Boolean(picker), picker ? '' : 'directory picker missing');
  if (!picker) {
    rec('workspace.connected', false, 'picker did not open');
    return false;
  }

  await clickNamed(wc, 'edit path|编辑路径');
  await sleep(250);
  const filled = await pageScript(wc, `
    const dialog = dshDialogNamed('select workspace directory|选择工作区目录');
    if (!dialog) return false;
    const input = Array.from(dialog.querySelectorAll('input, textarea')).find(dshShown)
      || dshFind('edit path|编辑路径', dialog);
    if (!input) return false;
    input.focus();
    return dshSetValue(input, args.path);
  `, { path: workspacePath });
  if (!filled) {
    rec('workspace.connected', false, 'path editor missing');
    return false;
  }
  await pressEnter(wc);
  const openReady = await waitUntil(() => pageScript(wc, `
    const dialog = dshDialogNamed('select workspace directory|选择工作区目录');
    if (!dialog) return null;
    const btn = Array.from(dialog.querySelectorAll('button')).find((el) =>
      dshShown(el) && /^(open|打开)$/i.test(dshLabel(el)) && !el.disabled);
    return btn || null;
  `), 12_000);
  if (openReady) {
    await pageScript(wc, `
      const dialog = dshDialogNamed('select workspace directory|选择工作区目录');
      const btn = dialog && Array.from(dialog.querySelectorAll('button')).find((el) =>
        dshShown(el) && /^(open|打开)$/i.test(dshLabel(el)) && !el.disabled);
      if (!btn) return false;
      btn.click();
      return true;
    `);
  } else {
    // Fallback: confirm with Enter when Open stays disabled longer than expected.
    await pressEnter(wc);
  }
  let pickerClosed = await waitUntil(() => pageEval(wc, () =>
    !dshDialogNamed('select workspace directory|选择工作区目录')), 12_000);
  if (!pickerClosed) {
    await pressEnter(wc);
    pickerClosed = await waitUntil(() => pageEval(wc, () =>
      !dshDialogNamed('select workspace directory|选择工作区目录')), 8_000);
  }
  const connected = await waitUntil(() => pageEval(wc, () => {
    const ta = document.querySelector('[data-composer-card] textarea');
    return Boolean(ta && !ta.disabled);
  }), 15_000);
  if (connected && !pickerClosed) {
    // Workspace already unlocked; dismiss a stuck directory dialog so chrome is usable.
    await pageEval(wc, () => {
      const dialog = dshDialogNamed('select workspace directory|选择工作区目录');
      if (!dialog) return false;
      const close = Array.from(dialog.querySelectorAll('button')).find((el) =>
        dshShown(el) && /^(open|打开|cancel|取消|close|关闭)$/i.test(dshLabel(el)));
      if (close) {
        close.click();
        return true;
      }
      return false;
    });
    if (typeof helpers.pressEscape === 'function') {
      for (let i = 0; i < 4; i += 1) {
        await helpers.pressEscape(wc);
        await sleep(100);
      }
    }
    pickerClosed = await waitUntil(() => pageEval(wc, () =>
      !dshDialogNamed('select workspace directory|选择工作区目录')), 5_000);
  }
  rec('workspace.pickerClosed', Boolean(pickerClosed), pickerClosed ? '' : 'picker stayed open', true);
  rec(
    'workspace.connected',
    Boolean(connected),
    connected ? workspacePath : 'session still locked',
  );
  return Boolean(connected);
}

/**
 * Drive one assembled-desktop UI walk against a live harness webContents.
 * Callers must attach the CDP debugger when they need Escape via pressEscape.
 *
 * @param {Electron.WebContents} wc - harness page (BrowserView), not the boot shell.
 * @param {{ pressEscape: Function, clickTitlebarButton: Function, surfacesPattern: string, terminalPattern: string }} helpers
 * @returns {Promise<{ ok: boolean, steps: Array<{ name: string, ok: boolean, optional?: boolean, detail: string }> }>}
 */
async function runReleaseUiWalk(wc, helpers) {
  const steps = [];
  const rec = makeRecorder(steps);

  const dismiss = async () => {
    for (let i = 0; i < 4; i += 1) {
      await helpers.pressEscape(wc);
      await sleep(120);
    }
  };

  const openSurface = async (kind) => {
    await pageScript(wc, `
      window.dispatchEvent(new CustomEvent('dshd-open-surface', { detail: { kind: args.kind } }));
      return true;
    `, { kind });
  };

  const openSettings = async (section) => {
    const opened = await wc.executeJavaScript(buildSettingsSectionScript(section));
    await sleep(400);
    return opened;
  };

  try {
  await dismiss();
  if (helpers.skipWorkspaceConnect) {
    rec('workspace.picker', true, 'connected before titlebar hits');
    rec('workspace.connected', true, helpers.workspacePath || '');
  } else {
    await connectConfiguredWorkspace(wc, helpers, rec);
  }

  const frame = await pageEval(wc, () => {
    const el = document.querySelector('[class*="frame"]');
    const grid = el ? getComputedStyle(el).gridTemplateColumns.trim() : '';
    return {
      present: Boolean(el),
      columns: grid ? grid.split(/\s+/).length : 0,
      grid,
      collapsed: el ? el.getAttribute('data-surfaces-collapsed') : null,
    };
  });
  rec('frame.fourColumn', frame?.columns === 4, frame?.grid || 'missing frame');

  const composer = await pageEval(wc, () => {
    const card = document.querySelector('[data-composer-card]');
    return {
      card: dshShown(card),
      textarea: Boolean(card && dshShown(card.querySelector('textarea'))),
      commands: Boolean(dshFind('^commands$|^命令$')),
      send: Boolean(dshFind('send message|发送消息')),
      access: Boolean(dshFind('access mode|访问模式')),
    };
  });
  rec('composer.card', composer?.card, '');
  rec('composer.textarea', composer?.textarea, '');
  rec('composer.commands', composer?.commands, '');
  rec('composer.send', composer?.send, '');
  rec('composer.access', composer?.access, '');

  await pageEval(wc, () => {
    const ta = document.querySelector('[data-composer-card] textarea');
    if (!ta) return false;
    ta.focus();
    return dshSetValue(ta, '$fo');
  });
  await sleep(500);
  const skillMenu = await pageEval(wc, () => ({
    foo: Boolean(dshFind('foo-skill')),
    menuitem: Boolean(document.querySelector('[role="menuitem"]') && dshShown(document.querySelector('[role="menuitem"]'))),
    typed: (document.querySelector('[data-composer-card] textarea') || {}).value || '',
  }));
  rec(
    'composer.skillMenuAbsent',
    !skillMenu?.foo && skillMenu?.typed === '$fo',
    skillMenu?.foo
      ? 'foo-skill menu opened'
      : `typed=${skillMenu?.typed || ''}; menuitem=${Boolean(skillMenu?.menuitem)}`,
  );

  await pageEval(wc, () => {
    const ta = document.querySelector('[data-composer-card] textarea');
    if (!ta) return false;
    ta.focus();
    return dshSetValue(ta, '@');
  });
  await sleep(700);
  const pathSource = await pageEval(wc, () => ({
    pathRows: document.querySelectorAll('[data-source="path"]').length,
    typed: (document.querySelector('[data-composer-card] textarea') || {}).value || '',
  }));
  rec(
    'composer.pathSourceAbsent',
    pathSource?.pathRows === 0,
    pathSource?.pathRows
      ? `desktop path source rows=${pathSource.pathRows}`
      : `typed=${pathSource?.typed || ''}`,
  );
  await pageEval(wc, () => {
    const ta = document.querySelector('[data-composer-card] textarea');
    return ta ? dshSetValue(ta, '') : false;
  });

  const remoteSnap = typeof helpers.probeRemote === 'function'
    ? await helpers.probeRemote()
    : null;
  rec(
    'remote.unavailable',
    remoteSnap != null && remoteSnap.available === false && remoteSnap.enabled === false,
    remoteSnap ? JSON.stringify(remoteSnap).slice(0, 200) : 'helpers.probeRemote missing',
  );
  rec(
    'remote.notListening',
    remoteSnap != null && remoteSnap.listening !== true,
    remoteSnap ? `listening=${remoteSnap.listening}` : 'helpers.probeRemote missing',
  );
  const remoteFooter = await pageEval(wc, () => {
    const trigger = document.querySelector('[data-dsh-remote-trigger], [data-sidebar-action="remote"]');
    if (trigger && dshShown(trigger)) return 'trigger';
    return dshFind('^remote$|^远程$') ? 'label' : null;
  });
  rec('remote.footerAbsent', remoteFooter == null, remoteFooter || 'no remote footer', true);

  const commandsClicked = await clickNamed(wc, '^commands$|^命令$');
  if (commandsClicked) {
    const menu = await waitUntil(() => pageEval(wc, () =>
      Boolean(document.querySelector('[role="listbox"], [role="menu"]'))), 3_000);
    rec('composer.commandsMenu', Boolean(menu), menu ? 'opened' : 'no menu', true);
    await dismiss();
  } else {
    rec('composer.commandsMenu', true, 'commands disabled or missing', true);
  }

  const titlebar = await pageEval(wc, () => {
    const bar = document.querySelector('#dshd-shell-titlebar-trailing');
    return {
      sessionLog: Boolean(dshFind('session log|会话日志', bar)),
      branch: Boolean(dshFind('switch branch|切换分支', bar)),
      commit: Boolean(dshFind('^commit|提交', bar)),
      git: Boolean(dshFind('git actions|git 操作', bar)),
      terminal: Boolean(dshFind('terminal|终端', bar)),
      surfaces: Boolean(dshFind('right panel|surfaces|右侧栏', bar)),
    };
  });
  rec('titlebar.sessionLog', titlebar?.sessionLog, '');
  rec('titlebar.branch', titlebar?.branch, '');
  rec('titlebar.commit', titlebar?.commit, '');
  rec('titlebar.git', titlebar?.git, '');
  rec('titlebar.terminal', titlebar?.terminal, '');
  rec('titlebar.surfaces', titlebar?.surfaces, '');

  await helpers.clickTitlebarButton(wc, 'switch branch|切换分支');
  const branchMenu = await waitUntil(() => pageEval(wc, () => {
    const bar = document.querySelector('#dshd-shell-titlebar-trailing');
    const btn = bar && dshFind('switch branch|切换分支', bar);
    return Boolean((btn && btn.getAttribute('aria-expanded') === 'true') || document.querySelector('[role="menu"]'));
  }), 5_000);
  rec('titlebar.branchMenu', Boolean(branchMenu), branchMenu ? 'opened' : 'did not open');
  await dismiss();

  await helpers.clickTitlebarButton(wc, 'git actions|git 操作');
  const gitMenu = await waitUntil(() => pageEval(wc, () => Boolean(document.querySelector('[role="menu"]'))), 5_000);
  rec('titlebar.gitMenu', Boolean(gitMenu), gitMenu ? 'opened' : 'did not open');
  await dismiss();
  const drawerOpen = await pageEval(wc, () => {
    const root = document.querySelector('[data-terminal-owner="drawer"]');
    return Boolean(root && dshShown(root) && root.getBoundingClientRect().height > 8);
  });
  if (!drawerOpen) {
    await helpers.clickTitlebarButton(wc, helpers.terminalPattern);
  }
  const drawer = await waitUntil(() => pageEval(wc, () => {
    const root = document.querySelector('[data-terminal-owner="drawer"]');
    if (!root || !dshShown(root) || root.getBoundingClientRect().height < 8) return null;
    return {
      newTerminal: Boolean(dshFind('new terminal|新建终端', root)),
    };
  }), 10_000);
  rec('terminal.drawer', Boolean(drawer), drawer ? '' : 'drawer did not open');
  rec('terminal.new', Boolean(drawer?.newTerminal), '');
  if (drawer) {
    await helpers.clickTitlebarButton(wc, helpers.terminalPattern);
    await sleep(250);
  }

  const surfacesOpen = await pageEval(wc, () => {
    const frameEl = document.querySelector('[class*="frame"]');
    return Boolean(frameEl && frameEl.getAttribute('data-surfaces-collapsed') !== 'true');
  });
  if (!surfacesOpen) {
    await helpers.clickTitlebarButton(wc, helpers.surfacesPattern);
  }
  const surfaces = await waitUntil(() => pageEval(wc, () => {
    const frameEl = document.querySelector('[class*="frame"]');
    if (!frameEl || frameEl.getAttribute('data-surfaces-collapsed') === 'true') return null;
    const empty = document.querySelector('[data-surfaces-empty]');
    const cards = empty && dshShown(empty)
      ? Array.from(empty.querySelectorAll('button')).map((el) => ({
        label: dshLabel(el).slice(0, 60),
        disabled: el.disabled,
      }))
      : [];
    return { empty: Boolean(empty && dshShown(empty)), cards };
  }), 10_000);
  rec('surfaces.open', Boolean(surfaces), surfaces ? '' : 'surfaces column stayed collapsed');

  if (surfaces?.empty) {
    const labels = (surfaces.cards || []).map((c) => c.label).join(' | ');
    const enabled = (re) => (surfaces.cards || []).some((c) => re.test(c.label) && !c.disabled);
    rec('surfaces.emptyCards', (surfaces.cards || []).length >= 5, labels, true);
    rec('surfaces.browserEnabled', enabled(/browser|浏览器/i), '', true);
    rec('surfaces.diffEnabled', enabled(/diff|差异/i), '', true);
    const clickedFiles = await pageEval(wc, () => {
      const empty = document.querySelector('[data-surfaces-empty]');
      const btn = empty && Array.from(empty.querySelectorAll('button')).find((el) =>
        /^(files|文件)(\s|$)/i.test(dshLabel(el)) && !el.disabled);
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!clickedFiles) await openSurface('files');
  } else {
    rec('surfaces.emptyCards', true, 'already occupied', true);
    rec('surfaces.browserEnabled', true, 'already occupied', true);
    rec('surfaces.diffEnabled', true, 'already occupied', true);
    await openSurface('files');
  }

  const files = await waitUntil(() => pageEval(wc, () => {
    const panel = document.querySelector('[data-files-panel]');
    if (!panel || !dshShown(panel)) return null;
    const text = panel.innerText || '';
    const readme = /README\.md/i.test(text);
    const note = /note\.md/i.test(text);
    if (!readme && !note) return null;
    return {
      search: Boolean(dshFind('search files|搜索文件', panel)),
      readme,
      note,
      text: text.slice(0, 160),
    };
  }), 20_000);
  const filesSnap = files || await pageEval(wc, () => {
    const panel = document.querySelector('[data-files-panel]');
    if (!panel) return null;
    const text = panel.innerText || '';
    return {
      search: Boolean(dshFind('search files|搜索文件', panel)),
      readme: /README\.md/i.test(text),
      note: /note\.md/i.test(text),
      text: text.slice(0, 160),
    };
  });
  rec('files.panel', Boolean(filesSnap), filesSnap ? '' : 'files panel missing');
  rec('files.search', Boolean(filesSnap?.search), '');
  rec('files.readme', Boolean(filesSnap?.readme), filesSnap?.readme ? '' : (filesSnap?.text || 'README.md not listed'));
  rec('files.note', Boolean(filesSnap?.note), filesSnap?.note ? '' : (filesSnap?.text || 'note.md not listed'));
  const mention = filesSnap
    ? await waitUntil(() => pageEval(wc, () => {
      const panel = document.querySelector('[data-files-panel]');
      return panel && dshFind('mention in composer|引用到输入框', panel);
    }), 10_000)
    : null;
  rec('files.mentionVisible', Boolean(mention), mention ? 'visible' : 'mention control missing');
  if (mention) {
    await pageEval(wc, () => {
      const panel = document.querySelector('[data-files-panel]');
      if (!panel) return false;
      const row = Array.from(panel.querySelectorAll('li')).find((el) =>
        dshShown(el) && /^note\.md$/i.test((el.querySelector('span') && el.querySelector('span').textContent) || dshLabel(el)));
      const btn = (row && dshFind('mention in composer|引用到输入框', row))
        || dshFind('mention in composer|引用到输入框', panel);
      if (!btn || btn.disabled) return false;
      btn.click();
      return true;
    });
    const draft = await waitUntil(() => pageEval(wc, () => {
      const ta = document.querySelector('[data-composer-card] textarea');
      const value = (ta && ta.value) || '';
      return /\[note\.md\]\(note\.md\)/.test(value) ? value : null;
    }), 5_000);
    rec('files.mentionAppended', Boolean(draft), draft || 'composer draft missing markdown link');
  } else {
    rec('files.mentionAppended', false, 'mention control missing');
  }

  if (filesSnap?.search) {
    await pageEval(wc, () => {
      const panel = document.querySelector('[data-files-panel]');
      const input = panel && (dshFind('search files|搜索文件', panel) || panel.querySelector('input'));
      if (!input) return false;
      input.focus();
      return dshSetValue(input, 'note');
    });
    const filtered = await waitUntil(() => pageEval(wc, () => {
      const panel = document.querySelector('[data-files-panel]');
      return Boolean(panel && /note\.md/i.test(panel.innerText || ''));
    }), 8_000);
    rec('files.searchFilter', Boolean(filtered), filtered ? 'note.md' : 'filter missed note.md', true);
  }

  await openSurface('agents');
  const agents = await waitUntil(() => pageEval(wc, () => {
    const panel = document.querySelector('[data-agents-panel]');
    if (!panel || !dshShown(panel)) return null;
    const text = panel.innerText || '';
    return { empty: /no agents yet|还没有子代理/i.test(text) };
  }), 10_000);
  rec('agents.panel', Boolean(agents), '');
  rec('agents.empty', Boolean(agents?.empty), agents?.empty ? '' : 'empty copy missing');

  await openSurface('diff');
  const diff = await waitUntil(() => pageEval(wc, () => {
    const panel = document.querySelector('[data-diff-panel]');
    if (!panel || !dshShown(panel)) return null;
    const text = panel.innerText || '';
    if (/差异仅适用于|only available in Git/i.test(text)) return null;
    return { text: text.slice(0, 120) };
  }), 12_000);
  const diffSnap = diff || await pageEval(wc, () => {
    const panel = document.querySelector('[data-diff-panel]');
    return panel && dshShown(panel) ? { text: (panel.innerText || '').slice(0, 120) } : null;
  });
  rec('diff.panel', Boolean(diffSnap) && !/差异仅适用于|only available in Git/i.test(diffSnap?.text || ''), diffSnap?.text || '');

  await openSurface('preview');
  const browser = await waitUntil(() => pageEval(wc, () => {
    const panel = document.querySelector('[data-preview-panel]');
    if (!panel || !dshShown(panel)) return null;
    const unavailable = panel.querySelector('[data-preview-unavailable]');
    const toolbar = panel.querySelector('[data-preview-toolbar]');
    const url = Boolean(
      dshFind('search or enter url|搜索或输入 url', panel)
      || panel.querySelector('input'),
    );
    return {
      unavailable: Boolean(unavailable && dshShown(unavailable)),
      toolbar: Boolean(toolbar && dshShown(toolbar)),
      url,
    };
  }), 10_000);
  rec('browser.panel', Boolean(browser) && !browser.unavailable, browser?.unavailable ? 'preview unavailable' : '');
  rec('browser.url', Boolean(browser?.url || browser?.toolbar), '');

  await openSurface('terminal');
  const termSurface = await waitUntil(() => pageEval(wc, () => {
    const root = document.querySelector('[data-terminal-owner="surface"]');
    return Boolean(root && dshShown(root) && root.getBoundingClientRect().height > 8);
  }), 10_000);
  rec('terminal.surface', Boolean(termSurface), '');

  await dismiss();
  const settingsTrigger = await pageEval(wc, () =>
    Boolean(document.querySelector('[data-dsh-settings-trigger]')));
  rec('settings.trigger', settingsTrigger, '');

  const appearanceOpened = await openSettings('appearance');
  const appearance = await waitUntil(() => pageEval(wc, () => {
    const dialog = dshDialog();
    if (!dialog) return null;
    const nav = document.querySelector('[data-dsh-settings-section="appearance"]');
    const text = dialog.innerText || '';
    return {
      nav: Boolean(nav),
      heading: Boolean(dshHeading('wallpaper|背景图', dialog)),
      choose: Boolean(dshFind('choose image|选择图片', dialog)),
      browse: Boolean(dshFind('browse gallery|浏览图库', dialog)),
      bingDaily: /Bing daily wallpapers|Bing 每日壁纸/.test(text),
      catalogUrls: /Wallpaper catalog URLs|壁纸目录地址/.test(text),
      placeholder: Boolean(dialog.querySelector('input[placeholder="https://example.com/wallpapers.json"]')),
    };
  }), 10_000);
  rec('appearance.choose', Boolean(appearanceOpened && appearance?.choose), appearanceOpened ? '' : 'settings did not open');
  rec('appearance.browse', Boolean(appearance?.browse), '');
  rec(
    'appearance.noSourceDump',
    Boolean(appearance) && !appearance.bingDaily && !appearance.catalogUrls && !appearance.placeholder,
    appearance?.bingDaily || appearance?.catalogUrls || appearance?.placeholder
      ? 'Appearance still lists gallery sources'
      : '',
  );

  if (appearance?.browse) {
    await clickNamed(wc, 'browse gallery|浏览图库');
  }
  const gallery = await waitUntil(() => pageEval(wc, () => {
    const galleryDialog = dshDialogNamed('browse gallery|浏览图库');
    if (!galleryDialog) return null;
    return {
      sources: Boolean(dshFind('^sources$|^图源$', galleryDialog)),
      items: (galleryDialog.innerText || '').slice(0, 80),
    };
  }), 15_000);
  rec('gallery.dialog', Boolean(gallery), gallery ? '' : 'browse gallery dialog missing');
  rec('gallery.sources', Boolean(gallery?.sources), gallery?.sources ? '' : 'Sources missing — wallpaper shell inject?');

  if (gallery?.sources) {
    await clickNamed(wc, '^sources$|^图源$');
    const sourcesPane = await waitUntil(() => pageEval(wc, () => {
      const galleryDialog = dshDialogNamed('browse gallery|浏览图库');
      if (!galleryDialog) return null;
      return {
        addSource: Boolean(dshFind('add source|新增图源', galleryDialog)),
        hint: /Categories come from here|分类来自这里/i.test(galleryDialog.innerText || ''),
      };
    }), 8_000);
    rec('gallery.addSource', Boolean(sourcesPane?.addSource), sourcesPane?.hint ? 'hint visible' : '');
  } else {
    rec('gallery.addSource', false, 'sources control missing');
  }

  await dismiss();
  await sleep(300);

  const mcpOpened = await openSettings('mcp');
  const mcp = await waitUntil(() => pageEval(wc, () => {
    const dialog = dshDialog();
    if (!dialog) return null;
    return {
      heading: Boolean(dshHeading('mcp servers|mcp 服务器', dialog)),
      search: Boolean(dshFind('search name|搜索名称', dialog) || dialog.querySelector('input[type="search"], [role="searchbox"]')),
      add: Boolean(dshFind('add server|添加服务器', dialog)),
    };
  }), 10_000);
  rec('mcp.heading', Boolean(mcpOpened && mcp?.heading), mcpOpened ? '' : 'mcp section missing');
  rec('mcp.search', Boolean(mcp?.search), '');
  rec('mcp.add', Boolean(mcp?.add), '');

  const skillsOpened = await openSettings('skills');
  const skills = await waitUntil(() => pageEval(wc, () => {
    const dialog = dshDialog();
    if (!dialog) return null;
    return {
      heading: Boolean(dshHeading('^skills$|^技能$', dialog)),
      add: Boolean(dshFind('add skill|添加技能', dialog)),
    };
  }), 10_000);
  rec('skills.heading', Boolean(skillsOpened && skills?.heading), '');
  rec('skills.add', Boolean(skills?.add), '');

  const pluginsOpened = await openSettings('plugins');
  const plugins = await waitUntil(() => pageEval(wc, () => {
    const dialog = dshDialog();
    const nav = document.querySelector('[data-dsh-settings-section="plugins"]');
    return {
      nav: Boolean(nav && nav.getAttribute('aria-current') === 'true'),
      heading: Boolean(dialog && dshHeading('^plugins$|^插件$', dialog)),
    };
  }), 10_000);
  rec('plugins.heading', Boolean(pluginsOpened && (plugins?.heading || plugins?.nav)), '');

  const marketOpened = await openSettings('market');
  const market = await waitUntil(() => pageEval(wc, () => {
    const nav = document.querySelector('[data-dsh-settings-section="market"]');
    const dialog = dshDialog();
    const text = dialog ? (dialog.innerText || '') : '';
    return {
      nav: Boolean(nav && (nav.getAttribute('aria-current') === 'true' || dshShown(nav))),
      discover: /discover|发现/i.test(text),
    };
  }), 10_000);
  rec('market.section', Boolean(marketOpened && market?.nav), marketOpened ? '' : 'market section missing');
  rec('market.discover', Boolean(market?.discover), '');

  await clickNamed(wc, '^installed$|^已安装$');
  const installed = await waitUntil(() => pageEval(wc, () => {
    const dialog = dshDialog();
    if (!dialog) return null;
    const tab = Array.from(dialog.querySelectorAll('[role="tab"]')).find((el) =>
      /installed|已安装/i.test(dshLabel(el)));
    const selected = Boolean(tab && tab.getAttribute('aria-selected') === 'true');
    const text = dialog.innerText || '';
    if (!selected && !/installed|已安装/i.test(text)) return null;
    return {
      selected,
      dshbot: /\bdshbot\b/i.test(text),
    };
  }), 8_000);
  rec('market.installed', Boolean(installed), installed ? '' : 'Installed tab missing');
  rec(
    'plugin.dshbot.market',
    Boolean(installed?.dshbot),
    installed?.dshbot ? 'listed on Installed' : 'preset Cordis plugin, not a market catalog row',
    true,
  );

  await dismiss();
  await sleep(300);

  const botsClicked = await pageEval(wc, () => {
    const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((el) =>
      dshShown(el) && /(bots|机器人)/i.test(dshLabel(el)));
    if (!tab) return false;
    tab.click();
    return true;
  });
  const bots = await waitUntil(() => pageEval(wc, () => {
    const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((el) =>
      /(bots|机器人)/i.test(dshLabel(el)));
    const selected = Boolean(tab && tab.getAttribute('aria-selected') === 'true');
    const text = document.body.innerText || '';
    const page = /no bots yet|还没有机器人|new bot|添加新 bot|add bot/i.test(text);
    return selected || page ? { selected, page } : null;
  }), 8_000);
  rec('plugin.dshbot.tab', Boolean(botsClicked || bots), botsClicked ? 'plugin sidebar contribution' : 'dshbot plugin tab missing');
  rec('plugin.dshbot.page', Boolean(bots?.page || bots?.selected), '');
  } catch (error) {
    rec('walk.uncaught', false, error && error.stack ? error.stack : String(error));
  }

  const failed = steps.filter((s) => !s.ok && !s.optional).map((s) => s.name);
  return {
    ok: failed.length === 0,
    failed,
    steps,
  };
}

/**
 * Fail a QA run when required assembled-UI steps did not pass.
 *
 * @param {{ qa?: { ok?: boolean, failed?: string[], steps?: Array<{ name: string, ok: boolean, optional?: boolean, detail?: string }> } }} result
 */
function assertReleaseQaResult(result) {
  const qa = result?.qa;
  if (!qa || qa.ok !== true) {
    const failed = (qa?.failed && qa.failed.length > 0)
      ? qa.failed
      : (qa?.steps || []).filter((s) => !s.ok && !s.optional).map((s) => `${s.name}: ${s.detail || ''}`);
    throw new Error(`Release QA failed:\n${failed.join('\n')}\n${JSON.stringify(qa)}`);
  }
  const names = new Set((qa.steps || []).map((s) => s.name));
  const missing = QA_REQUIRED_STEPS.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`Release QA omitted required steps: ${missing.join(', ')}`);
  }
}

module.exports = {
  runReleaseUiWalk,
  connectConfiguredWorkspace,
  makeRecorder,
  assertReleaseQaResult,
  QA_REQUIRED_STEPS,
  PAGE_HELPERS,
};
