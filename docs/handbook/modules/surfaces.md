# 模块：Surfaces 工作环

## 职责与非目标

**职责：** 右栏 Files / Diff / Browser / Agents ——可搜索、导航、选区进对话的工作环。  
**非目标：** 不做空态「功能卡片墙」；不做 GPU 终端嵌入、worktree、turn-diff、review-comment pick（见 work-loops note 范围外）。

## 用户路径

1. `Ctrl+\` 打开右栏。  
2. Files：搜文件、预览、Mention / 加入对话。  
3. Browser：URL 导航、可选截图 / PiP / 录制。  
4. Tab 关闭在标题右侧。

## 架构要点

- UI 在 harness client；预览栈在 main `preview.js` 及 `preview-*`。  
- Feature card：[../../features/surfaces-work-loops.md](../../features/surfaces-work-loops.md)

## 实现入口

- Main：`preview.js`、`preview-session.js`、`preview-workspace.js`、`preview-url.js` 等
- Note：`vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-16-surfaces-terminal-work-loops.md`

## 不变量

- 工作环，不是空态卡片网格。  
- 关闭控件在标题右侧。  
- Files 根目录 `listDir` 未完成时显示列出中，不把空 `root` 画成「此目录为空。」

## 门槛

- QA：`TC-SURF-001` … `TC-SURF-007`

## 延伸阅读

- [../superpowers/specs/2026-08-19-files-browser-logic-port-design.md](../../superpowers/specs/2026-08-19-files-browser-logic-port-design.md)
- [terminal.md](terminal.md)
