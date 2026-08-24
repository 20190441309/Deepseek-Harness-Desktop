function $(id) {
  return document.getElementById(id);
}

function pageShell() {
  return window.shell;
}

function setHint(text) {
  const node = $('hint');
  if (!text) {
    node.hidden = true;
    node.textContent = '';
    return;
  }
  node.hidden = false;
  node.textContent = text;
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => {
    const on = tab.dataset.tab === name;
    tab.classList.toggle('is-active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.panel').forEach((panel) => {
    const on = panel.id === `panel-${name}`;
    panel.classList.toggle('is-active', on);
    panel.hidden = !on;
  });
}

function badge(text, warn) {
  return `<span class="badge${warn ? ' warn' : ''}">${text}</span>`;
}

function renderReleases(payload, current) {
  const list = $('release-list');
  const rows = payload && Array.isArray(payload.releases) ? payload.releases : [];
  if (!rows.length) {
    list.innerHTML = `<li><span class="row-meta">${payload?.message || '没有可列出的正式版。'}</span></li>`;
    return;
  }
  list.innerHTML = rows.map((row) => {
    const marks = [
      row.current ? badge('当前') : '',
      row.prerelease ? badge('预发布') : '',
      row.installable ? '' : badge('无安装包', true),
    ].join('');
    const disabled = row.installable ? '' : 'disabled';
    return `<li>
      <div class="row-main">
        <div class="row-title">${row.tag || row.version || ''} ${marks}</div>
        <div class="row-meta">${row.assetName || '没有 Setup.exe'}</div>
      </div>
      <button type="button" class="ghost" data-install-tag="${row.tag || ''}" ${disabled}>安装</button>
    </li>`;
  }).join('');
  list.querySelectorAll('[data-install-tag]').forEach((button) => {
    button.addEventListener('click', () => installTag(button.dataset.installTag));
  });
  void current;
}

function renderPlugins(forensics) {
  const summary = $('forensics-summary');
  const list = $('plugin-list');
  if (!forensics) {
    summary.textContent = '还没有问诊结果。';
    list.innerHTML = '';
    return;
  }
  if (forensics.genericCause) {
    const labels = {
      oom: '内存不足（OOM），不是某个插件。',
      'port-in-use': '端口被占用，不是某个插件。',
      'missing-node': '找不到 Node，不是某个插件。',
    };
    summary.textContent = labels[forensics.genericCause] || forensics.genericCause;
  } else if (forensics.suspects && forensics.suspects.length) {
    summary.textContent = `日志里对得上的包：${forensics.suspects.map((row) => row.name || row).join('、')}`;
  } else {
    summary.textContent = '没有从日志抽出确定的包名。可以按下面名单自行禁用后再试。';
  }
  const rows = Array.isArray(forensics.plugins) ? forensics.plugins : [];
  list.innerHTML = rows.map((row) => {
    const marks = [
      row.preset ? badge('桌面预置') : '',
      row.disabled ? badge('已禁用') : '',
      row.suspect ? badge('可能导致失败', true) : '',
    ].join('');
    const disableBtn = row.preset && !row.disabled
      ? `<button type="button" class="ghost" data-disable="${row.name}">禁用</button>`
      : row.disabled
        ? `<button type="button" class="ghost" data-enable="${row.name}">启用</button>`
        : `<button type="button" class="ghost" data-disable="${row.name}">禁用</button>`;
    const removeBtn = row.preset
      ? ''
      : `<button type="button" class="danger" data-remove="${row.name}">删除</button>`;
    return `<li>
      <div class="row-main">
        <div class="row-title">${row.name} ${marks}</div>
        <div class="row-meta">${row.spec || ''}</div>
      </div>
      <div class="actions">${disableBtn}${removeBtn}</div>
    </li>`;
  }).join('');
  list.querySelectorAll('[data-disable]').forEach((button) => {
    button.addEventListener('click', () => actPlugin('disablePlugin', button.dataset.disable));
  });
  list.querySelectorAll('[data-enable]').forEach((button) => {
    button.addEventListener('click', () => actPlugin('enablePlugin', button.dataset.enable));
  });
  list.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => actPlugin('removePlugin', button.dataset.remove));
  });
}

async function actPlugin(method, name) {
  const api = pageShell();
  if (!api || typeof api[method] !== 'function') {
    return;
  }
  const result = await api[method](name);
  if (result && result.forensics) {
    renderPlugins(result.forensics);
  }
  if (result && result.ok === false) {
    setHint(result.error === 'preset' ? '预置包不能删除。' : (result.error || '操作失败'));
  }
}

async function refreshStatus() {
  const api = pageShell();
  if (!api) {
    return;
  }
  const status = await api.launcherStatus();
  const version = status?.version || status?.config?.appVersion || '';
  const last = status?.lastStart;
  const desktop = status?.desktop;
  const bits = [`当前版本 ${version || '未知'}`];
  if (desktop && desktop.state) {
    bits.push(`桌面 ${desktop.state}`);
  }
  if (last && last.ok === false) {
    bits.push(`上次启动失败：${last.error || '未知原因'}`);
  }
  $('home-status').textContent = bits.join(' · ');
  const config = status?.config || await api.getConfig();
  $('opt-quit').checked = config.quitAfterStart !== false;
  $('opt-auto').checked = config.autoStartDesktop !== false;
  $('opt-ask').checked = config.askOnUpdate !== false;
}

let importSourceHome;
const extraSkillDirs = [];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function skillSourceLabel(source) {
  if (source === 'home') {
    return '官方 home';
  }
  if (source === 'agents') {
    return '用户技能目录';
  }
  return '额外目录';
}

function pluginSkipLabel(reason) {
  if (reason === 'template') {
    return '官方模板，不重装';
  }
  if (reason === 'dropped') {
    return '已下架';
  }
  if (reason === 'local-spec') {
    return '本地 file / link / workspace，不重装';
  }
  return reason || '跳过';
}

function checkedValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked:not(:disabled)`)].map((node) => node.value);
}

function setGroupChecked(name, on) {
  document.querySelectorAll(`input[name="${name}"]:not(:disabled)`).forEach((node) => {
    node.checked = Boolean(on);
  });
}

const IMPORT_CATS = {
  sessions: { name: 'session-rel', hint: '按会话目录分组' },
  skills: { name: 'skill-id', hint: '官方 skills、用户技能根与额外目录' },
  plugins: { name: 'plugin-name', hint: '按名单重装，不拷 node_modules' },
  mcp: { name: 'mcp-id', hint: '按 id 合并，密钥不出现在界面' },
};

let importCat = 'sessions';

function sessionGroupKey(rel) {
  const text = String(rel || '');
  const slash = text.indexOf('/');
  return slash === -1 ? text : text.slice(0, slash);
}

function sessionItemTitle(rel) {
  const text = String(rel || '');
  const key = sessionGroupKey(text);
  return text.startsWith(`${key}/`) ? text.slice(key.length + 1) : text;
}

function countChecked(name) {
  return document.querySelectorAll(`input[name="${name}"]:checked:not(:disabled)`).length;
}

function countBoxes(name) {
  return document.querySelectorAll(`input[name="${name}"]`).length;
}

function showImportCat(name) {
  if (!IMPORT_CATS[name]) {
    return;
  }
  importCat = name;
  document.querySelectorAll('[data-import-cat]').forEach((button) => {
    const on = button.dataset.importCat === name;
    button.classList.toggle('is-active', on);
    button.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('[data-import-pane]').forEach((pane) => {
    const on = pane.dataset.importPane === name;
    pane.classList.toggle('is-active', on);
    pane.hidden = !on;
  });
  $('import-board-hint').textContent = IMPORT_CATS[name].hint;
}

function syncImportSummary() {
  const sessionsChecked = countChecked('session-rel');
  const skillsChecked = countChecked('skill-id');
  const pluginsChecked = countChecked('plugin-name');
  const mcpChecked = countChecked('mcp-id');
  $('import-sessions-count').textContent = `${sessionsChecked}/${countBoxes('session-rel')}`;
  $('import-skills-count').textContent = `${skillsChecked}/${countBoxes('skill-id')}`;
  $('import-plugins-count').textContent = `${pluginsChecked}/${countBoxes('plugin-name')}`;
  $('import-mcp-count').textContent = `${mcpChecked}/${countBoxes('mcp-id')}`;
  $('import-result').textContent = `已选 会话 ${sessionsChecked} · 技能 ${skillsChecked} · 插件 ${pluginsChecked} · MCP ${mcpChecked}`;
}

function syncSessionClusters() {
  const host = $('import-sessions');
  host.querySelectorAll('[data-import-cluster]').forEach((input) => {
    const key = input.dataset.importCluster;
    const boxes = [...host.querySelectorAll('input[name="session-rel"]')]
      .filter((node) => !node.disabled && sessionGroupKey(node.value) === key);
    const selected = boxes.filter((node) => node.checked).length;
    input.checked = boxes.length > 0 && selected === boxes.length;
    input.indeterminate = selected > 0 && selected < boxes.length;
  });
}

function renderSessionList(rows) {
  const host = $('import-sessions');
  if (!rows.length) {
    host.innerHTML = '<li><span class="row-meta">没有可列出的项。</span></li>';
    return;
  }
  const groups = new Map();
  for (const row of rows) {
    const key = sessionGroupKey(row.rel);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }
  const html = [];
  for (const [key, items] of groups) {
    const enabled = items.filter((row) => !row.unsupported);
    html.push(`<li class="import-cluster">
      <label class="check-row">
        <input type="checkbox" data-import-cluster="${escapeHtml(key)}" ${enabled.length ? 'checked' : 'disabled'} />
        <span class="row-main">
          <span class="row-title">${escapeHtml(key)}</span>
          <span class="row-meta">${items.length} 项</span>
        </span>
      </label>
    </li>`);
    for (const row of items) {
      const disabled = Boolean(row.unsupported);
      const notes = [];
      if (row.mixedEncoding) {
        notes.push('编码混用');
      }
      if (row.unsupported) {
        notes.push('不兼容旧库');
      }
      html.push(`<li class="import-item">
        <label class="check-row">
          <input type="checkbox" name="session-rel" value="${escapeHtml(row.rel)}" ${disabled ? 'disabled' : ''} ${disabled ? '' : 'checked'} />
          <span class="row-main">
            <span class="row-title">${escapeHtml(sessionItemTitle(row.rel))}${disabled ? badge('不兼容', true) : (row.conflict ? badge('已存在') : '')}</span>
            <span class="row-meta">${escapeHtml(notes.join(' · '))}</span>
          </span>
        </label>
      </li>`);
    }
  }
  host.innerHTML = html.join('');
}

function renderCheckList(targetId, rows, options) {
  const host = $(targetId);
  if (!rows.length) {
    host.innerHTML = '<li><span class="row-meta">没有可列出的项。</span></li>';
    return;
  }
  host.innerHTML = rows.map((row) => {
    const disabled = options.disabled(row);
    const checked = !disabled;
    return `<li>
      <label class="check-row">
        <input type="checkbox" name="${options.name}" value="${escapeHtml(options.value(row))}" ${disabled ? 'disabled' : ''} ${checked ? 'checked' : ''} />
        <span class="row-main">
          <span class="row-title">${escapeHtml(options.title(row))}${disabled ? badge(options.skipLabel(row), true) : (row.conflict ? badge('已存在') : '')}</span>
          <span class="row-meta">${escapeHtml(options.meta(row))}</span>
        </span>
      </label>
    </li>`;
  }).join('');
}

function scanOptions() {
  return {
    sourceHome: importSourceHome,
    extraSkillDirs: extraSkillDirs.slice(),
  };
}

function countStatus(rows, status) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row.status === status).length;
}

function summarizeImport(result) {
  if (!result) {
    return '没有返回结果。';
  }
  if (result.empty) {
    return '未选择任何项，没有写入桌面 home。';
  }
  const lines = [
    `会话 已拷 ${countStatus(result.sessions, 'copied')} · 跳过 ${countStatus(result.sessions, 'skipped')} · 拒绝 ${countStatus(result.sessions, 'rejected')}`,
    `技能 已拷 ${countStatus(result.skills, 'copied')} · 跳过 ${countStatus(result.skills, 'skipped')} · 拒绝 ${countStatus(result.skills, 'rejected')}`,
    `插件 已装 ${countStatus(result.plugins, 'installed')} · 跳过 ${countStatus(result.plugins, 'skipped')} · 失败 ${countStatus(result.plugins, 'failed')}`,
    `MCP 已写入 ${countStatus(result.mcp, 'copied')} · 跳过 ${countStatus(result.mcp, 'skipped')} · 拒绝 ${countStatus(result.mcp, 'rejected')}`,
    `附件 ${result.attachments || 'absent'}`,
  ];
  if (result.ok === false) {
    lines.push('导入未完全成功。官方来源未改写。');
  }
  return lines.join('\n');
}

async function refreshImport() {
  const api = pageShell();
  if (!api) {
    return;
  }
  const scan = await api.scanImport(scanOptions());
  const sourceLine = scan?.sourceHome
    ? `${scan.sourceHome}${scan.sourceHasData ? '（有可导入数据）' : '（没有可导入数据）'}${scan.destEmpty ? '；桌面会话为空' : ''}`
    : '还没有扫描结果。';
  $('import-source').textContent = sourceLine;
  $('import-source').title = scan?.sourceHome || '';
  $('import-skill-roots').hidden = extraSkillDirs.length === 0;
  $('import-skill-roots').textContent = extraSkillDirs.length
    ? `额外技能目录 ${extraSkillDirs.join('；')}`
    : '';

  const sessions = Array.isArray(scan?.sessions) ? scan.sessions : [];
  const skills = Array.isArray(scan?.skills) ? scan.skills : [];
  const plugins = Array.isArray(scan?.plugins) ? scan.plugins : [];
  const mcp = Array.isArray(scan?.mcp) ? scan.mcp : [];

  renderSessionList(sessions);
  renderCheckList('import-skills', skills, {
    name: 'skill-id',
    value: (row) => row.id,
    title: (row) => row.name,
    meta: (row) => skillSourceLabel(row.source),
    disabled: () => false,
    skipLabel: () => '',
  });
  renderCheckList('import-plugins', plugins, {
    name: 'plugin-name',
    value: (row) => row.name,
    title: (row) => row.name,
    meta: (row) => (row.skipped ? pluginSkipLabel(row.reason) : (row.spec || '')),
    disabled: (row) => Boolean(row.skipped),
    skipLabel: (row) => pluginSkipLabel(row.reason),
  });
  renderCheckList('import-mcp', mcp, {
    name: 'mcp-id',
    value: (row) => row.id,
    title: (row) => row.name || row.id,
    meta: (row) => [row.id, row.endpoint].filter(Boolean).join(' · '),
    disabled: () => false,
    skipLabel: () => '',
  });

  $('import-attachments').checked = Boolean(scan?.hasAttachments) && sessions.some((row) => !row.unsupported);
  syncSessionClusters();
  syncImportSummary();
}

async function refreshReleases() {
  const api = pageShell();
  if (!api) {
    return;
  }
  const payload = await api.listReleases();
  const status = await api.launcherStatus();
  renderReleases(payload, status?.version);
}

async function refreshPlugins() {
  const api = pageShell();
  if (!api) {
    return;
  }
  renderPlugins(await api.pluginForensics());
}

async function installTag(tag) {
  const api = pageShell();
  if (!api || !tag) {
    return;
  }
  if (!window.confirm(`将安装 ${tag} 并替换当前应用。继续？`)) {
    return;
  }
  $('update-progress').hidden = false;
  $('update-progress').textContent = '正在下载安装包…';
  const result = await api.installRelease(tag);
  if (result && result.status === 'error') {
    $('update-progress').textContent = result.message === 'no-installer' ? '这个版本没有 Setup.exe。' : (result.message || '安装失败');
  }
}

async function saveSettings() {
  const api = pageShell();
  if (!api) {
    return;
  }
  await api.saveLauncherConfig({
    quitAfterStart: $('opt-quit').checked,
    autoStartDesktop: $('opt-auto').checked,
    askOnUpdate: $('opt-ask').checked,
  });
}

function bind() {
  const api = pageShell();
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      showTab(tab.dataset.tab);
      if (tab.dataset.tab === 'import') void refreshImport();
      if (tab.dataset.tab === 'versions') void refreshReleases();
      if (tab.dataset.tab === 'plugins') void refreshPlugins();
    });
  });
  $('btn-start').addEventListener('click', () => api?.startDesktop());
  $('btn-skip').addEventListener('click', () => api?.skipUserPlugins());
  $('btn-retry-full').addEventListener('click', () => api?.retryFullPlugins());
  $('btn-pick-source').addEventListener('click', async () => {
    const picked = await api?.pickImportSource();
    if (picked) {
      importSourceHome = picked;
      await refreshImport();
    }
  });
  $('btn-pick-skill').addEventListener('click', async () => {
    const picked = await api?.pickSkillDir();
    if (picked && !extraSkillDirs.includes(picked)) {
      extraSkillDirs.push(picked);
      await refreshImport();
    }
  });
  $('btn-scan').addEventListener('click', () => refreshImport());
  document.querySelectorAll('[data-import-cat]').forEach((button) => {
    button.addEventListener('click', () => showImportCat(button.dataset.importCat));
  });
  $('import-board-body').addEventListener('change', (event) => {
    const cluster = event.target.closest('[data-import-cluster]');
    if (cluster && event.target === cluster) {
      const key = cluster.dataset.importCluster;
      $('import-sessions').querySelectorAll('input[name="session-rel"]').forEach((node) => {
        if (!node.disabled && sessionGroupKey(node.value) === key) {
          node.checked = cluster.checked;
        }
      });
    }
    syncSessionClusters();
    syncImportSummary();
  });
  $('btn-import-select-all').addEventListener('click', () => {
    setGroupChecked(IMPORT_CATS[importCat].name, true);
    syncSessionClusters();
    syncImportSummary();
  });
  $('btn-import-select-none').addEventListener('click', () => {
    setGroupChecked(IMPORT_CATS[importCat].name, false);
    syncSessionClusters();
    syncImportSummary();
  });
  $('btn-import').addEventListener('click', async () => {
    const result = await api?.runImport({
      ...scanOptions(),
      overwrite: $('import-overwrite').checked,
      importAttachments: $('import-attachments').checked,
      selectedRels: checkedValues('session-rel'),
      selectedSkillIds: checkedValues('skill-id'),
      selectedPluginNames: checkedValues('plugin-name'),
      selectedMcpIds: checkedValues('mcp-id'),
    });
    $('import-result').textContent = summarizeImport(result);
  });
  $('btn-refresh-releases').addEventListener('click', () => refreshReleases());
  $('btn-refresh-plugins').addEventListener('click', () => refreshPlugins());
  ['opt-quit', 'opt-auto', 'opt-ask'].forEach((id) => {
    $(id).addEventListener('change', () => saveSettings());
  });
  if (api?.onShowTab) {
    api.onShowTab((payload) => {
      if (payload?.tab) showTab(payload.tab);
      if (payload?.tab === 'import') void refreshImport();
      if (payload?.tab === 'plugins') void refreshPlugins();
    });
  }
  if (api?.onDesktopFailed) {
    api.onDesktopFailed((payload) => {
      showTab('plugins');
      setHint(payload?.error || '桌面端启动失败，已留在启动器。');
      void refreshPlugins();
    });
  }
  if (api?.onDesktopReady) {
    api.onDesktopReady(() => {
      setHint('');
      void refreshStatus();
    });
  }
  if (api?.onLauncherHint) {
    api.onLauncherHint((payload) => {
      const check = payload?.check;
      if (check?.status === 'error') {
        setHint(`更新检查失败：${check.message || '网络或 GitHub 不可用'}。仍可启动桌面端。`);
      } else if (check?.status === 'available') {
        setHint(`发现正式版 ${check.latest || ''}。`);
      } else {
        setHint('');
      }
    });
  }
  if (api?.onUpdateProgress) {
    api.onUpdateProgress((payload) => {
      $('update-progress').hidden = false;
      $('update-progress').textContent = payload?.phase === 'download'
        ? `下载 ${payload.percent || 0}%`
        : (payload?.phase || '处理中');
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const host = document.querySelector('.window-controls');
  if (typeof window.mountWindowControls === 'function') {
    window.mountWindowControls(host);
  }
  if (typeof window.watchShellTheme === 'function') {
    window.watchShellTheme();
  }
  bind();
  void refreshStatus();
});
