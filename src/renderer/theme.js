function applyTheme(theme) {
  if (!theme) {
    return;
  }
  const root = document.documentElement;
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--fg', theme.fg);
  root.style.setProperty('--muted', theme.muted);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--field', theme.field);
  root.style.setProperty('--line', theme.line);
  root.style.setProperty('--button-fg', theme.buttonFg);
  root.style.colorScheme = theme.scheme || 'dark';
  document.body?.style.setProperty('background', theme.bg);
}

function watchTheme() {
  const api = window.shell;
  if (api && typeof api.onTheme === 'function') {
    api.onTheme(applyTheme);
  }
  if (api && typeof api.getConfig === 'function') {
    Promise.resolve(api.getConfig())
      .then((config) => applyTheme(config.themeTokens))
      .catch(() => {});
  }
}

window.applyShellTheme = applyTheme;
window.watchShellTheme = watchTheme;
