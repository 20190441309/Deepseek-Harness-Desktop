(() => {
  const STYLE_ID = 'dsh-shell-integrated-chrome';
  const CONTROLS_ID = 'dsh-shell-controls';
  const DRAG_ID = 'dsh-shell-drag-strip';
  const MARK = 'data-dsh-shell-drag';
  const HIT = 'data-dsh-shell-hit';
  const CONTROL_SIZE = 32;
  const CONTROL_GAP = 0;
  const EDGE = 8;
  const CLUSTER = 8;

  const ICON_MIN = '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5.4" width="8" height="1.2" rx="0.6" fill="currentColor"/></svg>';
  const ICON_MAX = '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.4" y="2.4" width="7.2" height="7.2" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
  const ICON_RESTORE = '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="3.4" y="2.2" width="6.2" height="6.2" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.15"/><rect x="2.2" y="3.6" width="6.2" height="6.2" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.15"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3L3 9" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>';
  const ICON_MARKET = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.2 3.2h7.6v6.4H2.2z" fill="none" stroke="currentColor" stroke-width="1.15"/><path d="M4 3.2V2.4a2 2 0 0 1 4 0v.8" fill="none" stroke="currentColor" stroke-width="1.15"/></svg>';

  const INTERACTIVE = 'a, button, input, textarea, select, summary, label, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [contenteditable]';

  function toHex(input) {
    if (!input || input === 'transparent') {
      return '';
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillStyle = input;
    const painted = String(ctx.fillStyle || '');
    if (painted.startsWith('#')) {
      if (painted.length === 4) {
        return `#${painted[1]}${painted[1]}${painted[2]}${painted[2]}${painted[3]}${painted[3]}`;
      }
      return painted.slice(0, 7);
    }
    const match = painted.match(/rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i);
    if (!match) {
      return '';
    }
    const hex = (value) => Math.max(0, Math.min(255, Math.round(Number(value)))).toString(16).padStart(2, '0');
    return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`;
  }

  function isLightHex(hex) {
    const value = parseInt(String(hex || '#888888').replace('#', '').slice(0, 6), 16);
    if (Number.isNaN(value)) {
      return true;
    }
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 > 150;
  }

  function opaqueBg(el) {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      const hex = toHex(bg);
      if (hex && bg && bg !== 'transparent' && !String(bg).endsWith(', 0)') && bg !== 'rgba(0, 0, 0, 0)') {
        return hex;
      }
      node = node.parentElement;
    }
    return toHex(getComputedStyle(document.body).backgroundColor)
      || toHex(getComputedStyle(document.documentElement).backgroundColor)
      || '#ffffff';
  }

  function findSessionLog() {
    const buttons = document.querySelectorAll('button');
    for (const el of buttons) {
      const label = `${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`;
      if (/session\s*log/i.test(label)) {
        return el;
      }
    }
    return null;
  }

  function findTopBar() {
    const sessionLog = findSessionLog();
    if (sessionLog) {
      const header = sessionLog.closest('header');
      if (header instanceof HTMLElement) {
        return header;
      }
    }
    const nodes = document.querySelectorAll('header, [role="banner"], nav, body > *, body > * > *');
    let best = null;
    let bestWidth = 0;
    for (const el of nodes) {
      if (!(el instanceof HTMLElement) || el.id === STYLE_ID || el.id === CONTROLS_ID || el.id === DRAG_ID) {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.top > 8 || r.height < 32 || r.height > 160) {
        continue;
      }
      if (r.width < window.innerWidth * 0.35) {
        continue;
      }
      if (r.width > bestWidth) {
        best = el;
        bestWidth = r.width;
      }
    }
    return best;
  }

  function findLogoRow() {
    return document.querySelector('[class*="logoRow"]');
  }

  function findCenterCol() {
    return document.querySelector('[class*="centerCol"]');
  }

  function isVisibleChrome(el) {
    if (!(el instanceof HTMLElement)) {
      return false;
    }
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.top <= 8 && r.height >= 24 && r.width >= 24;
  }

  function reservedRight() {
    return EDGE + CONTROL_SIZE * 4 + CONTROL_GAP * 4 + CLUSTER;
  }

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.documentElement.appendChild(style);
    }
    style.textContent = `
      :root { --dsh-wco-pad: ${reservedRight()}px; }
      #${CONTROLS_ID} {
        position: fixed;
        top: 12px;
        right: ${EDGE}px;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: ${CONTROL_GAP}px;
        height: ${CONTROL_SIZE}px;
        padding: 0;
        background: transparent;
        -webkit-app-region: no-drag;
      }
      #${CONTROLS_ID} button {
        width: ${CONTROL_SIZE}px;
        height: ${CONTROL_SIZE}px;
        margin: 0;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--dsh-ctrl-fg, #3f3f46);
        cursor: pointer;
        -webkit-app-region: no-drag;
      }
      #${CONTROLS_ID} button svg {
        width: 12px;
        height: 12px;
        display: block;
      }
      #${CONTROLS_ID} button:hover {
        background: var(--dsh-ctrl-hover, rgba(0, 0, 0, 0.08));
      }
      #${CONTROLS_ID} button[data-act="close"]:hover {
        background: #e81123;
        color: #fff;
      }
      #${DRAG_ID} {
        position: fixed;
        top: 0;
        z-index: 2147483644;
        height: 56px;
        background: transparent;
        -webkit-app-region: drag;
      }
      [${MARK}] {
        -webkit-app-region: drag;
      }
      [${MARK}="main"] {
        padding-right: var(--dsh-wco-pad) !important;
      }
      [${MARK}] ${INTERACTIVE},
      [${HIT}] {
        -webkit-app-region: no-drag !important;
        pointer-events: auto;
      }
    `;
  }

  function ensureControls() {
    let host = document.getElementById(CONTROLS_ID);
    if (host) {
      return host;
    }
    host = document.createElement('div');
    host.id = CONTROLS_ID;
    host.innerHTML = [
      `<button type="button" data-act="marketplace" aria-label="插件市场">${ICON_MARKET}</button>`,
      `<button type="button" data-act="minimize" aria-label="最小化">${ICON_MIN}</button>`,
      `<button type="button" data-act="maximize" aria-label="最大化">${ICON_MAX}</button>`,
      `<button type="button" data-act="close" aria-label="关闭">${ICON_CLOSE}</button>`,
    ].join('');
    host.addEventListener('click', (event) => {
      const button = event.target.closest('[data-act]');
      if (!button || !window.shell) {
        return;
      }
      if (button.dataset.act === 'marketplace') {
        if (typeof window.shell.openMarketplace === 'function') {
          window.shell.openMarketplace();
        }
        return;
      }
      if (typeof window.shell.windowAction === 'function') {
        window.shell.windowAction(button.dataset.act);
      }
    });
    (document.body || document.documentElement).appendChild(host);
    return host;
  }

  function removeDragStrip() {
    document.getElementById(DRAG_ID)?.remove();
  }

  function placeDraftDragStrip() {
    let strip = document.getElementById(DRAG_ID);
    if (!strip) {
      strip = document.createElement('div');
      strip.id = DRAG_ID;
      (document.body || document.documentElement).appendChild(strip);
    }
    const center = findCenterCol();
    const left = center ? Math.max(0, Math.round(center.getBoundingClientRect().left)) : 0;
    strip.style.left = `${left}px`;
    strip.style.right = `${reservedRight()}px`;
    return strip;
  }

  function clearMarks() {
    document.querySelectorAll(`[${MARK}]`).forEach((el) => el.removeAttribute(MARK));
    document.querySelectorAll(`[${HIT}]`).forEach((el) => el.removeAttribute(HIT));
  }

  function markInteractive(root) {
    if (!(root instanceof HTMLElement)) {
      return;
    }
    if (root.matches(INTERACTIVE)) {
      root.setAttribute(HIT, '');
    }
    root.querySelectorAll(INTERACTIVE).forEach((el) => {
      if (el.closest(`#${CONTROLS_ID}`)) {
        return;
      }
      el.setAttribute(HIT, '');
    });
  }

  function placeControls(host, sessionLog) {
    host.style.right = `${EDGE}px`;
    host.style.gap = `${CONTROL_GAP}px`;
    host.style.height = `${CONTROL_SIZE}px`;
    host.style.padding = '0';
    if (sessionLog) {
      const r = sessionLog.getBoundingClientRect();
      const top = Math.round(r.top + (r.height - CONTROL_SIZE) / 2);
      host.style.top = `${Math.max(0, top)}px`;
    } else {
      host.style.top = '12px';
    }
    return reservedRight();
  }

  function applyControlTheme(host, bg, maximized) {
    const light = isLightHex(bg);
    host.style.setProperty('--dsh-ctrl-fg', light ? '#3f3f46' : '#f4f4f5');
    host.style.setProperty('--dsh-ctrl-hover', light ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)');
    const maxBtn = host.querySelector('[data-act="maximize"]');
    if (maxBtn) {
      maxBtn.innerHTML = maximized ? ICON_RESTORE : ICON_MAX;
      maxBtn.setAttribute('aria-label', maximized ? '还原' : '最大化');
    }
  }

  function measure() {
    ensureStyle();
    const host = ensureControls();
    clearMarks();

    const sessionLog = findSessionLog();
    const foundBar = findTopBar();
    const bar = isVisibleChrome(foundBar) ? foundBar : null;
    const logo = findLogoRow();
    const inset = placeControls(host, sessionLog);
    document.documentElement.style.setProperty('--dsh-wco-pad', `${inset}px`);

    let bg = opaqueBg(document.body);
    if (bar) {
      removeDragStrip();
      bg = opaqueBg(bar);
      bar.setAttribute(MARK, 'main');
      markInteractive(bar);
    } else {
      placeDraftDragStrip();
    }
    if (logo) {
      logo.setAttribute(MARK, '');
      markInteractive(logo);
    }
    if (sessionLog) {
      sessionLog.style.marginRight = '';
      sessionLog.setAttribute(HIT, '');
    }

    const maximized = Boolean(window.__dshShellMaximized);
    applyControlTheme(host, bg, maximized);

    const sample = { bg, height: CONTROL_SIZE, insetRight: inset };
    if (window.shell && typeof window.shell.reportChrome === 'function') {
      window.shell.reportChrome(sample);
    }
    return sample;
  }

  if (!window.__dshShellChromeBound) {
    window.__dshShellChromeBound = true;
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 80);
    };
    window.addEventListener('resize', schedule);
    if (window.shell && typeof window.shell.onWindowState === 'function') {
      window.shell.onWindowState((state) => {
        window.__dshShellMaximized = Boolean(state && state.maximized);
        measure();
      });
    }
    if (window.MutationObserver) {
      const obs = new MutationObserver(schedule);
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme', 'data-appearance', 'data-ds-dark-theme'],
      });
      if (document.body) {
        obs.observe(document.body, { childList: true, subtree: true });
      }
    }
    window.setTimeout(measure, 200);
    window.setTimeout(measure, 800);
    window.setTimeout(measure, 2000);
  }

  return measure();
})();
