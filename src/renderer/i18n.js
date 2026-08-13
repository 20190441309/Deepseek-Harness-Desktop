const TRANSLATIONS = {
  zh: {
    title: '设置',
    lead: '工作区默认为当前项目目录。主题即时生效；其余项保存后会重启 dsh web。',
    theme: '主题',
    workspace: '工作区',
    browse: '浏览',
    port: '端口',
    apiKey: 'DeepSeek API Key',
    baseUrl: 'API Base URL（可选）',
    baseUrlPlaceholder: '默认官方端点',
    closeToTray: '关闭窗口时最小化到托盘',
    openAtLogin: '开机时启动',
    pluginGenUi: '生成式 UI',
    pluginSubagent: '子代理',
    advanced: '高级',
    dshBin: 'dsh 可执行文件（可选）',
    dshBinPlaceholder: '留空则自动 npx / PATH',
    nodeBin: 'Node.js（可选）',
    nodeBinPlaceholder: '留空则自动检测',
    save: '保存并重启',
    saving: '正在保存并重启…',
    apiUnavailable: '桌面壳接口不可用',
    detectedNone: '未检测到全局 dsh，将使用 npx @deepseek-ai/dsh',
    themeSwitched: '已切换到「{name}」',
    pickDsh: '选择 dsh',
    pickNode: '选择 node.exe',
    aboutTitle: '关于',
    aboutApp: 'DeepSeek Harness GUI',
    aboutAppMeta: 'C:\\ai\\deepseek-harness-gui（无公开 Git 远程）',
    aboutHarness: '官方 Harness',
    aboutGenUi: '生成式 UI 插件',
    aboutSubagent: '子代理插件',
    localeLabel: '语言',
    themeMidnight: '午夜',
    themeCeladon: '青瓷',
    themeViolet: '暮紫',
    themeAmber: '琥珀',
    themePaper: '宣纸',
    themeContrast: '对比',
  },
  en: {
    title: 'Settings',
    lead: 'Workspace defaults to the current project directory. Theme applies immediately; other changes restart dsh web after save.',
    theme: 'Theme',
    workspace: 'Workspace',
    browse: 'Browse',
    port: 'Port',
    apiKey: 'DeepSeek API Key',
    baseUrl: 'API Base URL (optional)',
    baseUrlPlaceholder: 'Official endpoint by default',
    closeToTray: 'Minimize to tray when closing the window',
    openAtLogin: 'Start at login',
    pluginGenUi: 'Generative UI',
    pluginSubagent: 'Subagent',
    advanced: 'Advanced',
    dshBin: 'dsh executable (optional)',
    dshBinPlaceholder: 'Leave empty for automatic npx / PATH',
    nodeBin: 'Node.js (optional)',
    nodeBinPlaceholder: 'Leave empty to auto-detect',
    save: 'Save and restart',
    saving: 'Saving and restarting…',
    apiUnavailable: 'Desktop shell API is unavailable',
    detectedNone: 'No global dsh detected; will use npx @deepseek-ai/dsh',
    themeSwitched: 'Switched to "{name}"',
    pickDsh: 'Choose dsh',
    pickNode: 'Choose node.exe',
    aboutTitle: 'About',
    aboutApp: 'DeepSeek Harness GUI',
    aboutAppMeta: 'C:\\ai\\deepseek-harness-gui (no public git remote)',
    aboutHarness: 'Official Harness',
    aboutGenUi: 'Plugin GenUI',
    aboutSubagent: 'Plugin Subagent',
    localeLabel: 'Language',
    themeMidnight: 'Midnight',
    themeCeladon: 'Celadon',
    themeViolet: 'Violet',
    themeAmber: 'Amber',
    themePaper: 'Paper',
    themeContrast: 'Contrast',
  },
};

const THEME_KEYS = {
  midnight: 'themeMidnight',
  celadon: 'themeCeladon',
  violet: 'themeViolet',
  amber: 'themeAmber',
  paper: 'themePaper',
  contrast: 'themeContrast',
};

let currentLocale = 'zh';

function normalizeLocale(value) {
  return value === 'en' ? 'en' : 'zh';
}

function t(key, vars) {
  const table = TRANSLATIONS[currentLocale] || TRANSLATIONS.zh;
  let text = table[key] ?? TRANSLATIONS.zh[key] ?? key;
  if (vars) {
    text = String(text).replace(/\{(\w+)\}/g, (_, name) => (
      vars[name] == null ? '' : String(vars[name])
    ));
  }
  return text;
}

function themeName(id, fallback) {
  const key = THEME_KEYS[id];
  return key ? t(key) : (fallback || id);
}

function applyI18n() {
  document.documentElement.lang = currentLocale === 'en' ? 'en' : 'zh-CN';
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  document.querySelectorAll('[data-locale]').forEach((el) => {
    el.setAttribute('aria-pressed', el.dataset.locale === currentLocale ? 'true' : 'false');
  });
}

function setLocale(next) {
  currentLocale = normalizeLocale(next);
  applyI18n();
  return currentLocale;
}

function getLocale() {
  return currentLocale;
}

window.I18n = {
  translations: TRANSLATIONS,
  t,
  themeName,
  apply: applyI18n,
  setLocale,
  getLocale,
  normalize: normalizeLocale,
};
