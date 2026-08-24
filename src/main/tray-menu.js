'use strict';

/**
 * Tray context-menu rows. Labels are the product copy for TC-DESK-002.
 * @param {{
 *   onShow: () => void,
 *   onOpenLauncher: () => void,
 *   onSettings: () => void,
 *   onMarketplace: () => void,
 *   onRestart: () => void,
 *   onQuit: () => void,
 * }} actions
 * @returns {Array<{ label?: string, type?: string, click?: () => void }>}
 */
function trayMenuTemplate({ onShow, onOpenLauncher, onSettings, onMarketplace, onRestart, onQuit }) {
  return [
    { label: '显示窗口', click: () => onShow() },
    { label: '打开启动器', click: () => onOpenLauncher() },
    { label: '设置…', click: () => onSettings() },
    { label: '插件市场', click: () => onMarketplace() },
    { label: '重启 Harness', click: () => onRestart() },
    { type: 'separator' },
    { label: '退出', click: () => onQuit() },
  ];
}

module.exports = { trayMenuTemplate };
