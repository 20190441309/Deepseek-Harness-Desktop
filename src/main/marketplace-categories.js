const CATEGORIES = [
  { id: 'ui', label: '界面' },
  { id: 'workflow', label: '工作流' },
  { id: 'tool', label: '工具' },
  { id: 'notify', label: '通知' },
  { id: 'dev', label: '开发' },
  { id: 'learn', label: '学习' },
  { id: 'other', label: '其他' },
];

const IGNORED_TOPICS = new Set([
  'dsh-plugin',
  'dsh-plugins',
  'dsh',
  'deepseek-harness',
  'deepseek',
  'cordis',
  'typescript',
  'javascript',
  'ai',
  'ai-agent',
  'ai-agents',
  'llm',
  'plugin',
  'plugins',
  'harness',
]);

const RULES = [
  {
    id: 'notify',
    tokens: [
      'notify', 'notification', 'notifications', 'telegram', 'lark', 'feishu',
      'wechat', 'weixin', 'usage', 'cost', 'balance', 'channel', 'channels',
      '通知', '用量', '余额', '飞书', '微信',
    ],
  },
  {
    id: 'learn',
    tokens: [
      'learn', 'learning', 'explain', 'education', 'translate', 'translator',
      'notebook', 'notebooks', 'teach', 'tutorial', 'lesson',
      '学习', '讲解', '教育', '翻译', '笔记',
    ],
  },
  {
    id: 'workflow',
    tokens: [
      'workflow', 'workflows', 'loop', 'schedule', 'cron', 'review',
      'plan', 'automate', 'automation', 'routine', 'routines', 'orchestrat',
      '工作流', '循环', '计划', '审查', '定时', '自动化',
    ],
  },
  {
    id: 'tool',
    tokens: [
      'tool', 'tools', 'toolkit', 'mcp', 'browser', 'search', 'fetch',
      'filesystem', 'file-tree', 'shell', 'bash', 'web-search', 'ocr',
      'vision', 'sql', 'database',
      '工具', '浏览器', '搜索', '文件',
    ],
  },
  {
    id: 'ui',
    tokens: [
      'ui', 'tui', 'sidebar', 'theme', 'themes', 'skin', 'wallpaper',
      'navbar', 'panel', 'desktop', 'mobile', 'visual', 'visualize',
      'genui', 'chat', 'conversation', 'status-bar', 'statusbar',
      '界面', '侧栏', '主题', '皮肤', '终端',
    ],
  },
  {
    id: 'dev',
    tokens: [
      'git', 'debug', 'reload', 'reloader', 'policy', 'lint', 'test',
      'inspect', 'diff', 'code-review', 'devtools',
      '开发', '调试', '策略',
    ],
  },
];

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[@/_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(values) {
  const set = new Set();
  for (const value of values || []) {
    const text = normalize(value);
    if (!text || IGNORED_TOPICS.has(text)) {
      continue;
    }
    set.add(text);
    for (const part of text.split(/[\s-]+/)) {
      if (part && !IGNORED_TOPICS.has(part)) {
        set.add(part);
      }
    }
  }
  return set;
}

function haystackHas(haystack, token) {
  if (haystack.has(token)) {
    return true;
  }
  for (const item of haystack) {
    if (item.includes(token) || token.includes(item) && item.length >= 4) {
      return true;
    }
  }
  return false;
}

function matchRules(haystack) {
  for (const rule of RULES) {
    if (rule.tokens.some((token) => haystackHas(haystack, token))) {
      return rule.id;
    }
  }
  return null;
}

/**
 * Assign one product category. Topics win, then package keywords, then
 * repository name and description. Unmatched entries land in other.
 * @param {{ topics?: string[], keywords?: string[], name?: string, description?: string, repo?: string }} entry
 * @returns {string}
 */
function classifyPlugin(entry = {}) {
  const topics = matchRules(tokenSet(entry.topics));
  if (topics) {
    return topics;
  }
  const keywords = matchRules(tokenSet(entry.keywords));
  if (keywords) {
    return keywords;
  }
  const prose = matchRules(tokenSet([
    entry.name,
    entry.repo,
    entry.packageName,
    entry.description,
  ]));
  return prose || 'other';
}

function categoryLabel(id) {
  return CATEGORIES.find((item) => item.id === id)?.label || CATEGORIES[CATEGORIES.length - 1].label;
}

function countCategories(items) {
  const counts = Object.fromEntries(CATEGORIES.map((item) => [item.id, 0]));
  for (const item of items || []) {
    const id = CATEGORIES.some((row) => row.id === item.category) ? item.category : 'other';
    counts[id] += 1;
  }
  return [
    { id: 'all', label: '全部', count: (items || []).length },
    ...CATEGORIES.map((item) => ({ ...item, count: counts[item.id] })),
  ];
}

module.exports = {
  CATEGORIES,
  classifyPlugin,
  categoryLabel,
  countCategories,
};
