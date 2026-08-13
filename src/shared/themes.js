const THEMES = [
  {
    id: 'midnight',
    name: '午夜',
    scheme: 'dark',
    bg: '#0b0d12',
    fg: '#e8eef9',
    muted: '#8b93a7',
    accent: '#6ea8ff',
    field: '#141821',
    line: 'rgba(232, 238, 249, 0.10)',
    buttonFg: '#081018',
  },
  {
    id: 'celadon',
    name: '青瓷',
    scheme: 'dark',
    bg: '#071411',
    fg: '#e7f6f1',
    muted: '#7aa396',
    accent: '#3dd6b5',
    field: '#0d1f1b',
    line: 'rgba(231, 246, 241, 0.10)',
    buttonFg: '#04211a',
  },
  {
    id: 'violet',
    name: '暮紫',
    scheme: 'dark',
    bg: '#120e18',
    fg: '#f3eefc',
    muted: '#9b90b3',
    accent: '#c4a1ff',
    field: '#1b1524',
    line: 'rgba(243, 238, 252, 0.10)',
    buttonFg: '#1a1028',
  },
  {
    id: 'amber',
    name: '琥珀',
    scheme: 'dark',
    bg: '#14100b',
    fg: '#f6efe4',
    muted: '#a89880',
    accent: '#e2b15c',
    field: '#1e1810',
    line: 'rgba(246, 239, 228, 0.10)',
    buttonFg: '#23180a',
  },
  {
    id: 'paper',
    name: '宣纸',
    scheme: 'light',
    bg: '#f3efe6',
    fg: '#1c1915',
    muted: '#6f675c',
    accent: '#0f766e',
    field: '#fffdf8',
    line: 'rgba(28, 25, 21, 0.12)',
    buttonFg: '#f7fffe',
  },
  {
    id: 'contrast',
    name: '对比',
    scheme: 'dark',
    bg: '#050505',
    fg: '#f5f5f5',
    muted: '#9a9a9a',
    accent: '#ffffff',
    field: '#141414',
    line: 'rgba(245, 245, 245, 0.14)',
    buttonFg: '#050505',
  },
];

function listThemes() {
  return THEMES.map((theme) => ({
    id: theme.id,
    name: theme.name,
    bg: theme.bg,
    accent: theme.accent,
    scheme: theme.scheme,
  }));
}

function resolveTheme(config = {}) {
  const id = config.theme || 'midnight';
  return THEMES.find((theme) => theme.id === id) || THEMES[0];
}

function themeCssVars(theme) {
  return {
    '--bg': theme.bg,
    '--fg': theme.fg,
    '--muted': theme.muted,
    '--accent': theme.accent,
    '--field': theme.field,
    '--line': theme.line,
    '--button-fg': theme.buttonFg,
  };
}

function harnessThemeCss(theme) {
  return `::selection { background: ${theme.accent}; color: ${theme.buttonFg}; }`;
}

module.exports = {
  THEMES,
  listThemes,
  resolveTheme,
  themeCssVars,
  harnessThemeCss,
};
