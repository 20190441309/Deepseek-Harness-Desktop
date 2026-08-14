const { Menu, shell, dialog, app } = require('electron');
const { getMainWindow, createSettingsWindow } = require('./window');
const { loadConfig } = require('./config');

function buildMenu({ onOpenWorkspace, onRestart, onReload }) {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [{
        label: app.name,
        submenu: [
          { role: 'about', label: '关于' },
          { type: 'separator' },
          { role: 'quit', label: '退出' },
        ],
      }]
      : []),
    {
      label: '文件',
      submenu: [
        {
          label: '打开工作区…',
          accelerator: 'CmdOrCtrl+O',
          click: () => onOpenWorkspace(),
        },
        {
          label: '在资源管理器中打开工作区',
          click: () => {
            const { workspace } = loadConfig();
            if (workspace) {
              shell.openPath(workspace);
            }
          },
        },
        { type: 'separator' },
        {
          label: '设置…',
          accelerator: 'CmdOrCtrl+,',
          click: () => createSettingsWindow(),
        },
        { type: 'separator' },
        isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '运行',
      submenu: [
        {
          label: '重启 Harness',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => onRestart(),
        },
        {
          label: '重新加载界面',
          accelerator: 'CmdOrCtrl+R',
          click: () => onReload(),
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: 'Web UI 指南',
          click: () => shell.openExternal('https://deepseek-harness.github.io/deepseek-harness/guide/'),
        },
        {
          label: 'Python SDK',
          click: () => shell.openExternal('https://deepseek-harness.github.io/deepseek-harness/guide/python-sdk'),
        },
        { type: 'separator' },
        {
          label: '关于',
          click: () => {
            const win = getMainWindow();
            dialog.showMessageBox(win || undefined, {
              type: 'info',
              title: 'Deepseek-Harness-Desktop',
              message: 'Deepseek-Harness-Desktop',
              detail: 'Electron 桌面壳，嵌入官方 dsh web。\n当前工作区即本机所选项目目录。',
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildMenu };
