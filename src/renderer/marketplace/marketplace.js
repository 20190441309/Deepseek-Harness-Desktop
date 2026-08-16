const state = {
  items: [],
  categories: [],
  installed: new Map(),
  category: 'all',
  status: 'all',
  query: '',
  busy: false,
  warning: '',
  fetchedAt: 0,
  topicUrl: 'https://github.com/topics/dsh-plugin',
};

const els = {
  categories: document.getElementById('categories'),
  grid: document.getElementById('grid'),
  search: document.getElementById('search'),
  token: document.getElementById('token'),
  refresh: document.getElementById('refresh'),
  banner: document.getElementById('banner'),
  meta: document.getElementById('meta'),
  dialog: document.getElementById('dialog'),
  dialogTitle: document.getElementById('dialog-title'),
  dialogBody: document.getElementById('dialog-body'),
  dialogLog: document.getElementById('dialog-log'),
  dialogOk: document.getElementById('dialog-ok'),
  dialogCancel: document.getElementById('dialog-cancel'),
};

function api() {
  return window.shell || {};
}

function installedName(item) {
  if (item.packageName && state.installed.has(item.packageName)) {
    return item.packageName;
  }
  for (const [name, spec] of state.installed) {
    if (String(spec).includes(`${item.owner}/${item.repo}`)) {
      return name;
    }
  }
  return '';
}

function visibleItems() {
  const q = state.query.trim().toLowerCase();
  return state.items.filter((item) => {
    if (state.category !== 'all' && item.category !== state.category) {
      return false;
    }
    const installed = Boolean(installedName(item));
    if (state.status === 'installed' && !installed) {
      return false;
    }
    if (state.status === 'installable' && (installed || !item.isBundle)) {
      return false;
    }
    if (!q) {
      return true;
    }
    const hay = [item.id, item.packageName, item.description, item.category].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function formatTime(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function renderNav() {
  els.categories.innerHTML = (state.categories || []).map((row) => `
    <button type="button" class="cat${state.category === row.id ? ' active' : ''}" data-cat="${row.id}">
      <span>${row.label}</span>
      <span class="count">${row.count}</span>
    </button>
  `).join('');
}

function renderBanner() {
  if (!state.warning) {
    els.banner.hidden = true;
    els.banner.textContent = '';
    return;
  }
  els.banner.hidden = false;
  els.banner.textContent = state.warning;
}

function renderMeta() {
  const shown = visibleItems().length;
  const when = formatTime(state.fetchedAt);
  els.meta.textContent = when
    ? `显示 ${shown} / ${state.items.length} 个仓库 · 更新于 ${when}`
    : `显示 ${shown} / ${state.items.length} 个仓库`;
}

function renderGrid() {
  if (state.busy && !state.items.length) {
    els.grid.innerHTML = '<div class="empty">正在从 GitHub 读取 dsh-plugin 目录…</div>';
    return;
  }
  const items = visibleItems();
  if (!items.length) {
    els.grid.innerHTML = '<div class="empty">这一类里没有匹配的插件</div>';
    return;
  }
  els.grid.innerHTML = items.map((item) => {
    const installed = installedName(item);
    const canInstall = item.isBundle && !installed && !state.busy;
    const canRemove = Boolean(installed) && !state.busy;
    return `
      <article class="card" data-id="${item.id}">
        <h3>${escapeHtml(item.repo)}</h3>
        <p>${escapeHtml(item.description || '暂无简介')}</p>
        <div class="tags">
          <span class="tag">${escapeHtml(categoryLabel(item.category))}</span>
          <span class="tag">★ ${item.stars}</span>
          ${item.isBundle ? '<span class="tag ok">可安装</span>' : '<span class="tag warn">非 bundle</span>'}
          ${installed ? '<span class="tag ok">已安装</span>' : ''}
        </div>
        <div class="card-actions">
          ${canInstall ? `<button type="button" class="primary" data-act="install" data-spec="${escapeAttr(item.installSpec)}" data-repo="${escapeAttr(item.repo)}">安装</button>` : ''}
          ${canRemove ? `<button type="button" data-act="remove" data-name="${escapeAttr(installed)}">卸载</button>` : ''}
          <button type="button" data-act="open" data-url="${escapeAttr(item.homepage)}">仓库</button>
        </div>
      </article>
    `;
  }).join('');
}

function categoryLabel(id) {
  const row = (state.categories || []).find((item) => item.id === id);
  return row ? row.label : '其他';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function render() {
  renderNav();
  renderBanner();
  renderMeta();
  renderGrid();
}

function showDialog({ title, body, ok = '继续', cancel = '取消', log = '' }) {
  els.dialogTitle.textContent = title;
  els.dialogBody.textContent = body;
  els.dialogOk.textContent = ok;
  els.dialogCancel.textContent = cancel;
  els.dialogLog.hidden = !log;
  els.dialogLog.textContent = log;
  els.dialog.hidden = false;
  return new Promise((resolve) => {
    const finish = (value) => {
      els.dialog.hidden = true;
      els.dialogOk.onclick = null;
      els.dialogCancel.onclick = null;
      resolve(value);
    };
    els.dialogOk.onclick = () => finish(true);
    els.dialogCancel.onclick = () => finish(false);
  });
}

function appendLog(line) {
  els.dialogLog.hidden = false;
  els.dialogLog.textContent = `${els.dialogLog.textContent}${els.dialogLog.textContent ? '\n' : ''}${line}`;
  els.dialogLog.scrollTop = els.dialogLog.scrollHeight;
}

async function loadCatalog(refresh = false) {
  state.busy = true;
  render();
  try {
    const [catalog, installed] = await Promise.all([
      refresh && api().refreshMarketplace
        ? api().refreshMarketplace()
        : api().listMarketplace({ refresh }),
      api().listInstalledPlugins ? api().listInstalledPlugins() : { plugins: [] },
    ]);
    state.items = catalog?.items || [];
    state.categories = catalog?.categories || [];
    state.warning = catalog?.warning || '';
    state.fetchedAt = catalog?.fetchedAt || 0;
    state.topicUrl = catalog?.topicUrl || state.topicUrl;
    state.installed = new Map((installed?.plugins || []).map((row) => [row.name, row.spec]));
  } catch (error) {
    state.warning = error.message || String(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function install(spec, repo) {
  if (typeof api().seedInstallDraft !== 'function') {
    await showDialog({
      title: '请在主窗口安装',
      body: '请打开设置 → 插件 → 插件市场，从那里安装。安装会预填一条会话草稿，由你自己发送。',
      ok: '知道了',
      cancel: '关闭',
    });
    return;
  }
  const result = await api().seedInstallDraft({ repo, installSpec: spec });
  if (!result?.ok) {
    await showDialog({
      title: '无法预填安装请求',
      body: '请先打开主窗口的 Harness 界面，再从设置 → 插件 → 插件市场安装。',
      ok: '知道了',
      cancel: '关闭',
    });
  }
}

async function uninstall(name) {
  const confirmed = await showDialog({
    title: '卸载插件',
    body: `从 web profile 移除 ${name}，然后重启 Harness。`,
    ok: '卸载并重启',
  });
  if (!confirmed) {
    return;
  }
  state.busy = true;
  render();
  const result = await api().uninstallPlugin(name);
  state.busy = false;
  if (!result?.ok) {
    await showDialog({ title: '卸载失败', body: result?.error || '卸载失败', ok: '知道了', cancel: '关闭', log: result?.log || '' });
  }
  await loadCatalog(false);
}

els.categories.addEventListener('click', (event) => {
  const button = event.target.closest('[data-cat]');
  if (!button) {
    return;
  }
  state.category = button.dataset.cat;
  render();
});

document.querySelector('.status-filters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-status]');
  if (!button) {
    return;
  }
  state.status = button.dataset.status;
  document.querySelectorAll('.status-filters .chip').forEach((chip) => {
    chip.classList.toggle('active', chip === button);
  });
  render();
});

els.search.addEventListener('input', () => {
  state.query = els.search.value;
  render();
});

els.refresh.addEventListener('click', () => loadCatalog(true));

els.token.addEventListener('change', async () => {
  const value = els.token.value.trim();
  if (!value || !api().saveConfig) {
    return;
  }
  await api().saveConfig({ githubToken: value });
  els.token.value = '';
  els.token.placeholder = 'Token 已保存';
});

els.grid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-act]');
  if (!button || state.busy) {
    return;
  }
  if (button.dataset.act === 'install') {
    install(button.dataset.spec, button.dataset.repo);
    return;
  }
  if (button.dataset.act === 'remove') {
    uninstall(button.dataset.name);
    return;
  }
  if (button.dataset.act === 'open' && api().openExternal) {
    api().openExternal(button.dataset.url);
  }
});

if (api().onPluginProgress) {
  api().onPluginProgress((payload) => {
    if (payload?.line) {
      appendLog(payload.line);
    }
  });
}

if (typeof window.watchShellTheme === 'function') {
  window.watchShellTheme();
}

if (api().getConfig) {
  Promise.resolve(api().getConfig()).then((config) => {
    if (config?.hasGithubToken) {
      els.token.placeholder = 'Token 已保存';
    }
  }).catch(() => {});
}

loadCatalog(false);
