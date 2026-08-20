import test from 'node:test';
import assert from 'node:assert/strict';
import { DESKTOP_ONLY_ROWS, SETTINGS_TABS, settingsHasDesktopRows, visibleScreen } from './chrome.js';

test('visibleScreen prefers settings then chat then connect', () => {
  assert.equal(visibleScreen({}), 'connect');
  assert.equal(visibleScreen({ connected: true }), 'chat');
  assert.equal(visibleScreen({ connected: true, settingsOpen: true }), 'settings');
});

test('settings tabs exist and desktop-only rows stay out', () => {
  assert.deepEqual(SETTINGS_TABS, ['通用设置', '外观', '界面设置', '权限', '模型', 'MCP', '技能', '插件', '关于']);
  assert.equal(settingsHasDesktopRows(['主题', '语言']), false);
  assert.equal(settingsHasDesktopRows(['关闭窗口时']), true);
  assert.ok(DESKTOP_ONLY_ROWS.includes('打开配置文件'));
});
