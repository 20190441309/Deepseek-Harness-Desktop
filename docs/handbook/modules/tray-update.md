# 模块：托盘、关闭与更新

## 职责与非目标

**职责：** 托盘菜单、关闭进托盘、GitHub Releases 自动更新检查/安装。  
**非目标：** 不实现旁路更新通道；不绕过单实例。

## 用户路径

1. 点关闭 → 按配置进托盘或退出。  
2. 托盘：显示主窗、设置、退出等。  
3. 关于 / 菜单触发检查更新 → 下载进度 → 安装。

## 架构要点

- `tray.js`、`close-behavior.js`、`update.js`、`menu.js`

## 实现入口

- 上列 `src/main` 文件；preload `checkUpdate` / `installUpdate` / `onUpdateProgress`

## 不变量

- 关闭行为可配置且重启后保持（验收表有持久化相关条）。  
- 更新来源为项目 Releases。

## 门槛

- QA：§11 托盘/关闭/更新相关用例（见验收表）

## 延伸阅读

- [README.md](../../../README.md) 桌面能力简述
