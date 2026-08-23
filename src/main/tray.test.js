'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { trayMenuTemplate } = require('./tray-menu');

test('tray menu lists show, settings, marketplace, restart, and quit', () => {
  const clicks = [];
  const items = trayMenuTemplate({
    onShow: () => clicks.push('show'),
    onSettings: () => clicks.push('settings'),
    onMarketplace: () => clicks.push('market'),
    onRestart: () => clicks.push('restart'),
    onQuit: () => clicks.push('quit'),
  });
  const labels = items.map((item) => item.label || item.type);
  assert.deepEqual(labels, ['显示窗口', '设置…', '插件市场', '重启 Harness', 'separator', '退出']);
  items.find((item) => item.label === '显示窗口').click();
  items.find((item) => item.label === '设置…').click();
  items.find((item) => item.label === '插件市场').click();
  items.find((item) => item.label === '重启 Harness').click();
  items.find((item) => item.label === '退出').click();
  assert.deepEqual(clicks, ['show', 'settings', 'market', 'restart', 'quit']);
});
