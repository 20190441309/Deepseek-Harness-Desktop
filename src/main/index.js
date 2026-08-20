const { app, dialog, globalShortcut, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { loadConfig, saveConfig } = require('./config');
const { DshManager, ensureOwnedPort } = require('./dsh');
const { HarnessController } = require('./harness-controller');
const { stripDroppedPlugins, healDanglingBundles, ensureDesktopInstallPlugin } = require('./plugins');
const { ensureDshMarketPlugin } = require('./dshmarket-preset');
const { ensureWorkspace } = require('./workspace-rpc');
const { registerIpc } = require('./ipc');
const { RemoteGateway } = require('./remote');
const { buildMenu } = require('./menu');
const { createTray, showMain } = require('./tray');
const {
  startDesktopInstallControl,
  stopDesktopInstallControl,
  desktopInstallReady,
} = require('./desktop-install-control');
const { installPlugin } = require('./marketplace-install');
const { downloadSavePath } = require('./download-path');
const {
  createMainWindow,
  getMainWindow,
  showBoot,
  showHarness,
  sendToBoot,
  isBootLoaded,
  getHarnessWebContents,
  hideHarnessView,
} = require('./window');
const { showClosingOverlay } = require('./closing-overlay');
const { hideOnClose } = require('./close-behavior');

const dsh = new DshManager();
const remote = new RemoteGateway({
  getTarget: () => (dsh.state === 'ready' && dsh.port ? { port: dsh.port } : null),
  getConfig: loadConfig,
  saveConfig,
});
remote.on('error', (error) => {
  dsh.log(`手机 Remote 错误：${error.message || String(error)}`, 'error');
});
let quitting = false;
let stoppingForQuit = false;
let desktopResources = null;

async function resolveLaunchTarget() {
  const config = loadConfig();
  const host = config.host || '127.0.0.1';
  const wanted = Number(config.port) || 3080;
  dsh.log(`检测端口 ${host}:${wanted}`);
  const port = await ensureOwnedPort(host, wanted, (line) => dsh.log(line));
  return { port };
}

const harness = new HarnessController({
  dsh,
  remote,
  loadConfig,
  createMainWindow,
  getMainWindow,
  showBoot,
  showHarness,
  sendToBoot,
  isBootLoaded,
  getHarnessWebContents,
  resolveLaunchTarget,
  stripDroppedPlugins,
  ensureDesktopInstallPlugin,
  ensureDshMarketPlugin,
  healDanglingBundles,
  saveConfig,
  appVersion: app.getVersion(),
  ensureWorkspace,
});

async function pickWorkspace() {
  const win = getMainWindow();
  const result = await dialog.showOpenDialog(win || undefined, {
    title: '选择工作区',
    defaultPath: loadConfig().workspace,
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  saveConfig({ workspace: result.filePaths[0] });
  await restartWithCleanup();
  return result.filePaths[0];
}

/** Tear down desktop-bound child processes and views (PTY, BrowserView). */
function cleanupDesktopResources() {
  if (!desktopResources) {
    return;
  }
  try {
    desktopResources.pty.killAll();
  } catch (error) {
    dsh.log(`PTY 清理失败：${error.message}`, 'app');
  }
  void Promise.resolve(desktopResources.preview.closeAll()).catch((error) => {
    dsh.log(`预览清理失败：${error.message}`, 'app');
  });
}

function restartWithCleanup() {
  cleanupDesktopResources();
  return harness.restart();
}

function reloadWithCleanup() {
  cleanupDesktopResources();
  return harness.reload();
}

const SMOKE_SURFACES = 'right panel|surfaces|\u53f3\u4fa7\u680f';
const SMOKE_BRANCH = 'switch branch|\u5207\u6362\u5206\u652f';
const SMOKE_GIT = 'git actions|git \u64cd\u4f5c';
const SMOKE_TERMINAL = 'terminal|\u7ec8\u7aef';
const SMOKE_ONBOARDING = '^\u7ee7\u7eed$|^Continue$|^\u7a0d\u540e\u914d\u7f6e$|^Configure later$';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(probe, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value) {
      return value;
    }
    await sleep(200);
  }
  return null;
}

async function clickClientCenter(wc, x, y) {
  const point = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
  await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...point });
  await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point });
}

async function titlebarButtonRect(wc, pattern) {
  return wc.executeJavaScript(`(() => {
    const match = new RegExp(${JSON.stringify(pattern)}, 'i');
    const titlebar = document.querySelector('#dshd-shell-titlebar-trailing');
    if (!titlebar) return null;
    const buttons = Array.from(titlebar.querySelectorAll('button'));
    const button = buttons.find((el) =>
      match.test((el.getAttribute('aria-label') || el.textContent || '').trim()))
      || (match.test('right panel')
        ? titlebar.querySelector('[data-panel-layout-controls] button:nth-of-type(2)')
        : null);
    if (!button) return null;
    const box = button.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return null;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  })()`);
}

async function titlebarMenuOpen(wc, pattern) {
  return wc.executeJavaScript(`(() => {
    const match = new RegExp(${JSON.stringify(pattern)}, 'i');
    const titlebar = document.querySelector('#dshd-shell-titlebar-trailing');
    const button = titlebar && Array.from(titlebar.querySelectorAll('button')).find((el) =>
      match.test((el.getAttribute('aria-label') || el.textContent || '').trim()));
    return Boolean(button && button.getAttribute('aria-expanded') === 'true')
      || Boolean(document.querySelector('[role="menu"]'));
  })()`);
}

async function clickTitlebarButton(wc, pattern) {
  return wc.executeJavaScript(`(() => {
    const match = new RegExp(${JSON.stringify(pattern)}, 'i');
    const titlebar = document.querySelector('#dshd-shell-titlebar-trailing');
    if (!titlebar) return false;
    const buttons = Array.from(titlebar.querySelectorAll('button'));
    const button = buttons.find((el) =>
      match.test((el.getAttribute('aria-label') || el.textContent || '').trim()))
      || (match.test('right panel')
        ? titlebar.querySelector('[data-panel-layout-controls] button:nth-of-type(2)')
        : null);
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
}

async function pressEscape(wc) {
  const key = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 };
  await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
  await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
}

/** Dismiss rc.7 first-run onboarding so titlebar hit-testing can reach the chrome. */
async function dismissFirstRunOnboarding(wc) {
  const blocking = await waitUntil(() => wc.executeJavaScript(`(() => {
    const root = document.getElementById('root');
    return Boolean((root && root.inert) || document.querySelector('[role="dialog"]'));
  })()`), 5_000);
  if (!blocking) {
    return true;
  }
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await wc.executeJavaScript(`(() => {
      const match = new RegExp(${JSON.stringify(SMOKE_ONBOARDING)});
      const button = Array.from(document.querySelectorAll('button')).find((el) =>
        match.test((el.textContent || '').trim()) && !el.disabled);
      if (!button) return false;
      button.click();
      return true;
    })()`);
    const clear = await wc.executeJavaScript(`(() => {
      const root = document.getElementById('root');
      return Boolean(root && !root.inert) && !document.querySelector('[role="dialog"]');
    })()`);
    if (clear) {
      return true;
    }
    await sleep(300);
  }
  return false;
}

/** Real-coordinate clicks after surfaces opens. Zero hits fail the smoke. */
async function probeTitlebarHits(wc) {
  const hits = { surfaces: 0, branch: 0, git: 0 };
  const wasAttached = wc.debugger.isAttached();
  if (!wasAttached) {
    await wc.debugger.attach('1.3');
  }
  try {
    if (!await dismissFirstRunOnboarding(wc)) {
      return { hits, error: 'onboarding still open' };
    }
    const surfaces = await waitUntil(() => titlebarButtonRect(wc, SMOKE_SURFACES), 5_000);
    if (surfaces) {
      await clickClientCenter(wc, surfaces.x, surfaces.y);
    } else if (!await clickTitlebarButton(wc, SMOKE_SURFACES)) {
      return { hits, error: 'surfaces toggle missing' };
    }
    hits.surfaces += 1;
    let opened = await waitUntil(() => wc.executeJavaScript(`(() => {
      const frame = document.querySelector('[class*="frame"]');
      if (!frame) return false;
      return frame.getAttribute('data-surfaces-collapsed') !== 'true';
    })()`), 10_000);
    if (!opened && surfaces && await clickTitlebarButton(wc, SMOKE_SURFACES)) {
      opened = await waitUntil(() => wc.executeJavaScript(`(() => {
        const frame = document.querySelector('[class*="frame"]');
        if (!frame) return false;
        return frame.getAttribute('data-surfaces-collapsed') !== 'true';
      })()`), 10_000);
    }
    if (!opened) {
      return {
        hits,
        error: 'surfaces did not open',
      };
    }

    const branch = await waitUntil(() => titlebarButtonRect(wc, SMOKE_BRANCH), 20_000);
    if (branch) {
      await clickClientCenter(wc, branch.x, branch.y);
    } else if (!await clickTitlebarButton(wc, SMOKE_BRANCH)) {
      return { hits, error: 'branch trigger missing' };
    }
    hits.branch += 1;
    let branchMenuOpen = await waitUntil(() => titlebarMenuOpen(wc, SMOKE_BRANCH), 5_000);
    if (!branchMenuOpen && branch && await clickTitlebarButton(wc, SMOKE_BRANCH)) {
      branchMenuOpen = await waitUntil(() => titlebarMenuOpen(wc, SMOKE_BRANCH), 5_000);
    }
    if (!branchMenuOpen) {
      return { hits, error: 'branch menu did not open' };
    }
    await pressEscape(wc);
    await waitUntil(async () => !(await titlebarMenuOpen(wc, SMOKE_BRANCH)), 3_000);
    await sleep(200);

    const git = await waitUntil(() => titlebarButtonRect(wc, SMOKE_GIT), 10_000);
    if (git) {
      await clickClientCenter(wc, git.x, git.y);
    } else if (!await clickTitlebarButton(wc, SMOKE_GIT)) {
      return { hits, error: 'git actions missing' };
    }
    hits.git += 1;
    let gitMenuOpen = await waitUntil(() => titlebarMenuOpen(wc, SMOKE_GIT), 5_000);
    if (!gitMenuOpen && git && await clickTitlebarButton(wc, SMOKE_GIT)) {
      gitMenuOpen = await waitUntil(() => titlebarMenuOpen(wc, SMOKE_GIT), 5_000);
    }
    if (!gitMenuOpen) {
      return { hits, error: 'git menu did not open' };
    }
    return { hits, error: null };
  } finally {
    if (!wasAttached && wc.debugger.isAttached()) {
      try {
        wc.debugger.detach();
      } catch {
        // Detach is best-effort before process exit.
      }
    }
  }
}

/** Open both terminal owners and report the colors that actually reach the DOM and canvas. */
async function probeThemeBackgrounds(wc) {
  const wasAttached = wc.debugger.isAttached();
  if (!wasAttached) {
    await wc.debugger.attach('1.3');
  }
  try {
    await pressEscape(wc);
    await waitUntil(() => wc.executeJavaScript(`(() => !document.querySelector('[role="menu"]'))()`), 3_000);
    await dismissFirstRunOnboarding(wc);
    await wc.executeJavaScript(`(() => {
      window.dispatchEvent(new CustomEvent('dshd-open-surface', { detail: { kind: 'terminal' } }));
      return true;
    })()`);
    const surface = await waitUntil(() => wc.executeJavaScript(`(() => {
      const root = document.querySelector('[data-terminal-owner="surface"]');
      return root && root.getBoundingClientRect().height > 0;
    })()`), 10_000);
    if (!surface) return { ok: false, error: 'surface terminal did not open' };

    const terminalToggle = await waitUntil(() => titlebarButtonRect(wc, SMOKE_TERMINAL), 5_000);
    if (terminalToggle) {
      await clickClientCenter(wc, terminalToggle.x, terminalToggle.y);
    } else if (!await clickTitlebarButton(wc, SMOKE_TERMINAL)) {
      return { ok: false, error: 'terminal drawer toggle missing' };
    }
    const drawer = await waitUntil(() => wc.executeJavaScript(`(() => {
      const root = document.querySelector('[data-terminal-owner="drawer"]');
      return root && root.getBoundingClientRect().height > 0;
    })()`), 10_000);
    if (!drawer) return { ok: false, error: 'terminal drawer did not open' };

    await wc.executeJavaScript(`(() => {
      for (const owner of ['surface', 'drawer']) {
        const root = document.querySelector('[data-terminal-owner="' + owner + '"]');
        const button = root && Array.from(root.querySelectorAll('button')).find((el) =>
          /new terminal|\u65b0\u5efa\u7ec8\u7aef/i.test(el.getAttribute('aria-label') || el.textContent || ''));
        if (button && !button.disabled) button.click();
      }
      return true;
    })()`);
    const panesOpened = await waitUntil(() => wc.executeJavaScript(`(() => Boolean(
      document.querySelector('[data-terminal-owner="surface"] [data-terminal-pane]')
      && document.querySelector('[data-terminal-owner="drawer"] [data-terminal-pane]')
    ))()`), 15_000);
    if (!panesOpened) {
      return wc.executeJavaScript(`(() => {
        const read = (owner) => {
          const root = document.querySelector('[data-terminal-owner="' + owner + '"]');
          return {
            height: root?.getBoundingClientRect().height || 0,
            buttons: root ? Array.from(root.querySelectorAll('button')).map((el) => ({
              label: el.getAttribute('aria-label') || el.textContent || '',
              disabled: el.disabled,
            })) : [],
          };
        };
        return { ok: false, error: 'terminal panes did not open', debug: {
          surface: read('surface'),
          drawer: read('drawer'),
          cwd: document.querySelector('[data-terminal-owner="drawer"]')?.textContent || '',
        } };
      })()`);
    }

    return wc.executeJavaScript(`(() => {
      const stylesFor = (element) => {
        if (!element) return null;
        const styles = getComputedStyle(element);
        return {
          backgroundColor: styles.backgroundColor,
          backgroundImage: styles.backgroundImage,
          color: styles.color,
        };
      };
      const canvasPixel = (element) => {
        const canvas = element?.querySelector('canvas');
        if (!canvas || canvas.width < 1 || canvas.height < 1) return null;
        try {
          return Array.from(canvas.getContext('2d')?.getImageData(0, 0, 1, 1).data || []);
        } catch {
          return null;
        }
      };
      const readOwner = (owner) => {
        const root = document.querySelector('[data-terminal-owner="' + owner + '"]');
        const pane = root?.querySelector('[data-terminal-pane]');
        const xterm = pane?.querySelector('.xterm');
        const viewport = pane?.querySelector('.xterm-viewport');
        const screen = pane?.querySelector('.xterm-screen');
        return {
          root: stylesFor(root),
          pane: stylesFor(pane),
          xterm: stylesFor(xterm),
          viewport: stylesFor(viewport),
          screen: stylesFor(screen),
          canvasPixel: canvasPixel(xterm),
        };
      };
      const tokenStyles = getComputedStyle(document.body);
      const rootTokenStyles = getComputedStyle(document.documentElement);
      const frame = document.querySelector('[class*="frame"]');
      const frameTokenStyles = frame ? getComputedStyle(frame) : null;
      const tokenValue = (name) => tokenStyles.getPropertyValue(name).trim()
        || rootTokenStyles.getPropertyValue(name).trim()
        || frameTokenStyles?.getPropertyValue(name).trim()
        || '';
      const tokens = {
        base: tokenValue('--dsw-alias-bg-base'),
        layer2: tokenValue('--dsw-alias-bg-layer-2'),
      };
      const isBlack = (value) => {
        const match = String(value || '').match(/rgba?\\(\\s*0[ ,]+0[ ,]+0(?:[ ,/]+(?:0|1(?:\\.0*)?))?\\s*\\)/i);
        return Boolean(match);
      };
      const owners = { surface: readOwner('surface'), drawer: readOwner('drawer') };
      const backgrounds = [
        owners.surface?.root?.backgroundColor,
        owners.surface?.pane?.backgroundColor,
        owners.surface?.viewport?.backgroundColor,
        owners.drawer?.root?.backgroundColor,
        owners.drawer?.pane?.backgroundColor,
        owners.drawer?.viewport?.backgroundColor,
      ];
      return {
        ok: Boolean(
          owners.surface?.root
          && owners.surface?.pane
          && owners.drawer?.root
          && owners.drawer?.pane
          && tokens.base
          && tokens.layer2
          && backgrounds.every(value => !isBlack(value)),
        ),
        tokens,
        owners,
      };
    })()`);
  } finally {
    if (!wasAttached && wc.debugger.isAttached()) {
      try {
        wc.debugger.detach();
      } catch {
        // Detach is best-effort before process exit.
      }
    }
  }
}

/** One-shot launch smoke: report the assembled chrome and exit with its status. */
async function runSmoke(win) {
  const pageErrors = [];
  const exitSmoke = async (code) => {
    await Promise.allSettled([
      Promise.resolve(desktopResources?.pty?.killAll()),
      Promise.resolve(desktopResources?.preview?.closeAll()),
    ]);
    await Promise.resolve(harness.shutdown()).catch(() => {});
    app.exit(code);
  };
  const wc = getHarnessWebContents(win) || win.webContents;
  const onError = (_event, error) => { pageErrors.push(String(error).slice(0, 500)); };
  wc.on('render-process-gone', (_event, details) => {
    pageErrors.push(`render-process-gone: ${details.reason}`);
  });
  wc.on('console-message', (details) => {
    const message = details?.message;
    if (String(message).includes('Uncaught')) pageErrors.push(String(message).slice(0, 500));
  });
  wc.on('did-fail-load', onError);
  try {
    const bootShellApi = await win.webContents.executeJavaScript(`(() => {
      const api = window.shell;
      return {
        hasBootShellApi: Boolean(
          api
          && typeof api.getState === 'function'
          && typeof api.restart === 'function'
          && typeof api.windowAction === 'function'
        ),
        bootShellApiIsScoped: Boolean(
          api
          && typeof api.writeFile === 'undefined'
          && typeof api.saveConfig === 'undefined'
          && typeof api.ptyCreate === 'undefined'
        ),
      };
    })()`);
    const result = await wc.executeJavaScript(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 60 && !document.querySelector('[class*="frame"]'); i += 1) await sleep(250);
      await sleep(2500);
      const frame = document.querySelector('[class*="frame"]');
      const titlebar = document.querySelector('#dshd-shell-titlebar-trailing');
      const buttons = titlebar ? Array.from(titlebar.querySelectorAll('button')).map(b => (b.getAttribute('aria-label') || b.textContent || '').trim()) : [];
      const api = window.shell;
      return {
        hasFrame: Boolean(frame),
        gridColumns: frame ? getComputedStyle(frame).gridTemplateColumns : null,
        hasTitlebar: Boolean(titlebar),
        titlebarButtons: buttons,
        hasTerminalToggle: buttons.some(t => /terminal|\u7ec8\u7aef/i.test(t)),
        hasSurfacesToggle: buttons.some(t => /right panel|surfaces|\u53f3\u4fa7\u680f/i.test(t)),
        hasDragStrip: Boolean(document.getElementById('dshd-shell-drag-strip')),
        hasDragMark: Boolean(document.querySelector('[data-dshd-shell-drag]')),
        hasHitMark: Boolean(document.querySelector('[data-dshd-shell-hit]')),
        captionRegion: (() => {
          const caption = document.querySelector('[data-dshd-caption="band"]');
          return caption ? getComputedStyle(caption).webkitAppRegion : null;
        })(),
        hasHarnessShellApi: Boolean(
          api
          && typeof api.getConfig === 'function'
          && typeof api.listDir === 'function'
          && typeof api.ptyCreate === 'function'
          && typeof api.previewOpen === 'function'
        ),
        harnessShellApiIsScoped: Boolean(
          api
          && typeof api.restart === 'undefined'
          && typeof api.cancelRestart === 'undefined'
        ),
      };
    })()`);
    Object.assign(result, bootShellApi);
    console.log('[DSH_SMOKE]', JSON.stringify({ ...result, pageErrors }));
    // Real PTY probe: node-pty is the one native dependency; prove it can
    // spawn a shell inside Electron (or report the exact failure) so the
    // smoke distinguishes "UI renders" from "terminal backend actually works".
    let ptyStatus = 'skipped';
    let created = null;
    let unsubscribePty = () => {};
    let cancelPtyMarker = () => {};
    try {
      created = await Promise.race([
        desktopResources.pty.create({ cwd: loadConfig().workspace, cols: 80, rows: 24 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('pty-create timed out')), 15000)),
      ]);
      ptyStatus = `created:${created.id}`;
      const marker = `dshd-smoke-ok-${process.pid}-${Date.now()}`;
      let output = '';
      let markerSeen;
      const markerOutput = new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          settled = true;
          reject(new Error('pty marker timed out'));
        }, 10_000);
        cancelPtyMarker = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
          }
        };
        markerSeen = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        };
      });
      unsubscribePty = desktopResources.pty.onEvent((channel, payload) => {
        if (channel !== 'shell:pty-data' || payload.id !== created.id) {
          return;
        }
        output = `${output}${String(payload.data || '')}`.slice(-8_192);
        if (output.includes(marker)) {
          markerSeen();
        }
      });
      await desktopResources.pty.write(created.id, `echo ${marker}\r`);
      await markerOutput;
      ptyStatus = 'echoed:ok';
    } catch (error) {
      ptyStatus = `unavailable:${error.message}`;
    } finally {
      cancelPtyMarker();
      unsubscribePty();
      if (created) {
        await desktopResources.pty.kill(created.id).catch(() => {});
      }
    }
    console.log('[DSH_SMOKE_PTY]', ptyStatus);
    let titlebarHits = { hits: { surfaces: 0, branch: 0, git: 0 }, error: 'not-run' };
    try {
      titlebarHits = await probeTitlebarHits(wc);
    } catch (error) {
      titlebarHits = { hits: { surfaces: 0, branch: 0, git: 0 }, error: String(error) };
    }
    result.titlebarHits = titlebarHits;
    console.log('[DSH_SMOKE_HITS]', JSON.stringify(titlebarHits));
    if (process.env.DSH_THEME_SMOKE === '1') {
      try {
        result.themeSmoke = await probeThemeBackgrounds(wc);
      } catch (error) {
        result.themeSmoke = { ok: false, error: String(error) };
      }
      console.log('[DSH_THEME_SMOKE]', JSON.stringify(result.themeSmoke));
    }
    const hitCount = titlebarHits.hits.surfaces + titlebarHits.hits.branch + titlebarHits.hits.git;
    const ok = result.hasFrame
      && result.hasTitlebar
      && result.hasTerminalToggle
      && result.hasSurfacesToggle
      && result.hasDragStrip !== true
      && result.hasDragMark !== true
      && result.hasHitMark !== true
      && result.captionRegion === 'drag'
      && result.hasBootShellApi
      && result.bootShellApiIsScoped
      && result.hasHarnessShellApi
      && result.harnessShellApiIsScoped
      && hitCount > 0
      && titlebarHits.hits.surfaces > 0
      && titlebarHits.hits.branch > 0
      && titlebarHits.hits.git > 0
      && titlebarHits.error == null
      && ptyStatus === 'echoed:ok'
      && (process.env.DSH_THEME_SMOKE !== '1' || result.themeSmoke?.ok === true)
      && pageErrors.length === 0;
    try {
      fs.writeFileSync(path.join(app.getPath('userData'), 'dshd-smoke.json'), JSON.stringify({ ok, result, ptyStatus, pageErrors }, null, 2));
    } catch {
      // Best-effort: the exit code still carries the verdict.
    }
    await exitSmoke(ok ? 0 : 1);
  } catch (error) {
    console.log('[DSH_SMOKE] failed', String(error));
    await exitSmoke(1);
  }
}

function quitApp() {
  quitting = true;
  app.quit();
}

function ignoreFailure(promise) {
  Promise.resolve(promise).catch((error) => {
    dsh.log(error.message || String(error), 'error');
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.error('Deepseek-Harness-Desktop is already running. Quit the installed app before npm start (same appId single-instance lock).');
  app.quit();
} else {
  app.on('second-instance', () => {
    showMain();
  });

  app.setName('Deepseek-Harness-Desktop');
  app.setAppUserModelId('ai.deepseek.harness.gui');

  app.whenReady().then(async () => {
    const config = loadConfig();
    fs.mkdirSync(config.workspace, { recursive: true });
    saveConfig({ workspace: config.workspace });
    app.setLoginItemSettings({ openAtLogin: Boolean(config.openAtLogin) });

    startDesktopInstallControl({
      installPlugin: (spec, options) => installPlugin(spec, {
        ...options,
        token: loadConfig().githubToken,
      }),
      startHarness: restartWithCleanup,
    });
    try {
      await desktopInstallReady();
    } catch (error) {
      stopDesktopInstallControl();
      dsh.log(`桌面安装控制通道启动失败：${error.message || String(error)}`, 'error');
    }

    desktopResources = registerIpc({ dsh, harness, startHarness: restartWithCleanup, remote });
    buildMenu({
      onOpenWorkspace: () => ignoreFailure(pickWorkspace()),
      onRestart: () => ignoreFailure(restartWithCleanup()),
      onReload: () => ignoreFailure(reloadWithCleanup()),
    });
    createTray({
      onRestart: () => ignoreFailure(restartWithCleanup()),
      onQuit: () => quitApp(),
    });

    const win = createMainWindow();
    win.on('close', (event) => {
      if (quitting) {
        return;
      }
      if (hideOnClose(loadConfig(), quitting)) {
        event.preventDefault();
        win.hide();
        return;
      }
      event.preventDefault();
      quitApp();
    });

    session.defaultSession.on('will-download', (event, item) => {
      const dest = downloadSavePath(app.getPath('downloads'), item.getFilename());
      item.setSavePath(dest);
    });

    globalShortcut.register('CommandOrControl+Shift+I', () => {
      const win = getMainWindow();
      const wc = getHarnessWebContents(win) || win?.webContents;
      wc?.toggleDevTools();
    });

    try {
      await harness.start();
      if (process.env.DSH_SMOKE === '1') {
        void runSmoke(getMainWindow());
      }
    } catch {
      // boot page already shows the error
    }
  });

  app.on('activate', () => {
    const win = getMainWindow();
    if (win) {
      win.show();
    } else {
      ignoreFailure(harness.start());
    }
  });

  app.on('before-quit', (event) => {
    quitting = true;
    globalShortcut.unregisterAll();
    if (stoppingForQuit) {
      return;
    }
    event.preventDefault();
    stoppingForQuit = true;
    stopDesktopInstallControl();
    cleanupDesktopResources();
    hideHarnessView(getMainWindow());
    showClosingOverlay(getMainWindow(), loadConfig().locale)
      .catch(() => {})
      .then(() => harness.shutdown())
      .finally(() => app.quit());
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !hideOnClose(loadConfig())) {
      quitApp();
    }
  });
}
