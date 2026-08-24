'use strict';

const GENERIC_LABELS = {
  oom: '检测到内存不足（OOM），与单个插件无关。',
  'port-in-use': '检测到端口被占用，与单个插件无关。',
  'missing-node': '未找到 Node 运行时，与单个插件无关。',
};

const PLUGIN_ERROR_LABELS = {
  preset: '桌面预置插件不可移除。',
  'official-template': '官方模板插件不可禁用。',
  'missing-name': '缺少插件名称。',
};

/**
 * @param {string} code
 * @returns {string}
 */
function pluginErrorLabel(code) {
  return PLUGIN_ERROR_LABELS[code] || code || '操作失败';
}

/**
 * @param {{ ok?: boolean|null, error?: string }|null|undefined} lastStart
 * @param {{ skipUserPlugins?: boolean }|null|undefined} recovery
 * @param {{ genericCause?: string|null, suspects?: Array<{name:string}>, pluginTreeFailure?: boolean }|null|undefined} forensics
 * @param {{ state?: string }|null|undefined} desktop
 * @returns {boolean}
 */
function shouldShowRecovery(lastStart, recovery, forensics, desktop) {
  if (recovery?.skipUserPlugins) {
    return true;
  }
  if (lastStart?.ok === false) {
    return true;
  }
  if (desktop?.state === 'error') {
    return true;
  }
  if (!forensics) {
    return false;
  }
  if (forensics.genericCause) {
    return true;
  }
  if (forensics.pluginTreeFailure) {
    return true;
  }
  return Array.isArray(forensics.suspects) && forensics.suspects.length > 0;
}

/**
 * @param {{ ok?: boolean|null, error?: string }|null|undefined} lastStart
 * @param {{ skipUserPlugins?: boolean, reason?: string }|null|undefined} recovery
 * @param {{ genericCause?: string|null, suspects?: Array<{name:string}>, pluginTreeFailure?: boolean }|null|undefined} forensics
 * @returns {string}
 */
function recoveryVerdict(lastStart, recovery, forensics) {
  if (recovery?.skipUserPlugins) {
    return '当前在跳过用户插件模式下运行；完整加载请点「恢复完整插件并启动」。禁用单项不会自动加载全部用户插件。';
  }
  if (forensics?.genericCause) {
    return GENERIC_LABELS[forensics.genericCause] || String(forensics.genericCause);
  }
  if (forensics?.pluginTreeFailure || (forensics?.suspects && forensics.suspects.length)) {
    const names = (forensics.suspects || []).map((row) => row.name).join('、');
    return names
      ? `启动日志指向可疑插件：${names}。可逐项禁用后重新启动。`
      : '插件树加载失败。可逐项禁用下列插件后重新启动。';
  }
  if (lastStart?.ok === false) {
    return `上次启动失败：${lastStart.error || '原因未知'}`;
  }
  return '桌面端未就绪。可检查下列插件后重新启动。';
}

/**
 * @param {Array<{ name: string, suspect?: boolean, preset?: boolean, officialTemplate?: boolean, disabled?: boolean, orphan?: boolean }>} rows
 * @returns {typeof rows}
 */
function sortPluginRows(rows) {
  const list = Array.isArray(rows) ? [...rows] : [];
  const rank = (row) => {
    if (row.orphan) return 0;
    if (row.suspect) return 1;
    if (row.officialTemplate) return 4;
    if (row.preset) return 3;
    return 2;
  };
  list.sort((a, b) => {
    const delta = rank(a) - rank(b);
    if (delta !== 0) return delta;
    return String(a.name).localeCompare(String(b.name));
  });
  return list;
}

const launcherRecovery = {
  GENERIC_LABELS,
  PLUGIN_ERROR_LABELS,
  pluginErrorLabel,
  shouldShowRecovery,
  recoveryVerdict,
  sortPluginRows,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = launcherRecovery;
}
if (typeof window !== 'undefined') {
  window.launcherRecovery = launcherRecovery;
}
