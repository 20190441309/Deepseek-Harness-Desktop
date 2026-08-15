const OVERLAY_ID = 'dsh-shell-closing';

function overlayCss(theme) {
  return `
#${OVERLAY_ID} {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  background: ${theme.bg};
  color: ${theme.fg};
  color-scheme: ${theme.scheme || 'dark'};
  font: 15px/1.45 "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  -webkit-app-region: no-drag;
  pointer-events: all;
  user-select: none;
}
#${OVERLAY_ID} .dsh-shell-closing-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  min-width: 240px;
  padding: 28px 36px;
  border: 1px solid ${theme.line};
  border-radius: 16px;
  background: ${theme.field};
}
#${OVERLAY_ID} .dsh-shell-closing-spinner {
  width: 36px;
  height: 36px;
  border: 2px solid ${theme.line};
  border-top-color: ${theme.accent};
  border-radius: 50%;
  animation: dsh-shell-closing-spin 0.85s linear infinite;
}
#${OVERLAY_ID} .dsh-shell-closing-title {
  margin: 8px 0 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}
#${OVERLAY_ID} .dsh-shell-closing-detail {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: ${theme.muted};
}
@keyframes dsh-shell-closing-spin {
  to { transform: rotate(360deg); }
}
`;
}

function closingCopy(locale) {
  if (locale === 'en') {
    return {
      title: 'Closing',
      detail: 'Stopping the local Harness service…',
    };
  }
  return {
    title: '关闭中',
    detail: '正在停止本机 Harness 服务，请稍候',
  };
}

function overlayScript(copy) {
  return `(() => {
    const id = ${JSON.stringify(OVERLAY_ID)};
    const pick = (...keys) => {
      const styles = getComputedStyle(document.documentElement);
      for (const key of keys) {
        const value = styles.getPropertyValue(key).trim();
        if (value) return value;
      }
      return '';
    };
    const root = document.getElementById(id) || document.createElement('div');
    if (!root.id) {
      root.id = id;
      root.setAttribute('role', 'alertdialog');
      root.setAttribute('aria-busy', 'true');
      root.setAttribute('aria-live', 'assertive');
      root.setAttribute('aria-labelledby', id + '-title');
      const card = document.createElement('div');
      card.className = 'dsh-shell-closing-card';
      const spinner = document.createElement('div');
      spinner.className = 'dsh-shell-closing-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      const title = document.createElement('p');
      title.id = id + '-title';
      title.className = 'dsh-shell-closing-title';
      title.textContent = ${JSON.stringify(copy.title)};
      const detail = document.createElement('p');
      detail.className = 'dsh-shell-closing-detail';
      detail.textContent = ${JSON.stringify(copy.detail)};
      card.append(spinner, title, detail);
      root.append(card);
      (document.body || document.documentElement).append(root);
    }
    const bg = pick('--dsw-alias-bg-canvas', '--dsw-alias-bg', '--bg');
    const fg = pick('--dsw-alias-label-primary', '--fg');
    const muted = pick('--dsw-alias-label-tertiary', '--muted');
    const accent = pick('--dsw-alias-accent', '--dsw-alias-label-accent', '--accent');
    const field = pick('--dsw-alias-bg-module-platform', '--dsw-alias-bg-l2', '--field');
    const line = pick('--dsw-alias-border-l2', '--line');
    if (bg) root.style.background = bg;
    if (fg) root.style.color = fg;
    if (field) root.firstElementChild.style.background = field;
    if (line) root.firstElementChild.style.borderColor = line;
    if (muted) root.querySelector('.dsh-shell-closing-detail').style.color = muted;
    const spinner = root.querySelector('.dsh-shell-closing-spinner');
    if (line) spinner.style.borderColor = line;
    if (accent) spinner.style.borderTopColor = accent;
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve(true));
      });
    });
  })()`;
}

async function showClosingOverlay(win, locale) {
  if (!win || win.isDestroyed()) {
    return;
  }
  const { currentTheme } = require('./chrome');
  const theme = currentTheme();
  if (win.isMinimized()) {
    win.restore();
  }
  if (!win.isVisible()) {
    win.show();
  }
  win.setBackgroundColor(theme.bg);
  win.focus();
  try {
    await win.webContents.insertCSS(overlayCss(theme));
    await win.webContents.executeJavaScript(overlayScript(closingCopy(locale)));
  } catch {
    // The page may already be gone; quit continues without the overlay.
  }
}

module.exports = {
  overlayCss,
  closingCopy,
  showClosingOverlay,
};
