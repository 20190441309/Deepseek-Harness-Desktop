export const SETTINGS_TABS = [
  '通用设置', '外观', '界面设置', '权限', '模型', 'MCP', '技能', '插件', '关于',
];

export const DESKTOP_ONLY_ROWS = ['关闭窗口时', 'Harness 自动恢复', '打开配置文件'];

export function visibleScreen(state) {
  if (state?.settingsOpen) return 'settings';
  if (state?.connected) return 'chat';
  return 'connect';
}

export function settingsHasDesktopRows(labels) {
  return (labels || []).some((label) => DESKTOP_ONLY_ROWS.includes(label));
}
