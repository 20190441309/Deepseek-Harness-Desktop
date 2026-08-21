# 模块：终端

## 职责与非目标

**职责：** 底栏（及 surface）终端：PTY 读写、多会话、选区送对话。  
**非目标：** 不把终端做成空态说明卡；不做未承诺的 GPU 嵌入。

## 用户路径

1. `` Ctrl+` `` 打开底栏终端。  
2. 输入命令；选区可送进 Composer。  
3. 多会话 / 分屏（若 UI 提供）；销毁后可重建。

## 架构要点

- Main：`pty.js`（node-pty / Ghostty 资源路径见 `src/shared`）。  
- UI：`dsh-client-ui-user-terminal` 等。  
- Feature card：[../../features/terminal-drawer.md](../../features/terminal-drawer.md)

## 实现入口

- `src/main/pty.js`
- Preload：`ptyCreate` / `ptyWrite` / `ptyResize` / `ptyKill` / `onPtyData` / `onPtyExit`

## 不变量

- 终端是工作环的一部分，与 surfaces note 一致。  
- xterm 等宽网格，不套胶囊按钮皮。

## 门槛

- QA：`TC-TERM-001` … `TC-TERM-004`；`TC-CHAT-004`（附录终端轮）

## 延伸阅读

- work-loops Agent Note；[surfaces.md](surfaces.md)
