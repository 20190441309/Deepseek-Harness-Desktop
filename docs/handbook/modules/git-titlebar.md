# 模块：Git 标题栏

## 职责与非目标

**职责：** 标题栏 Git 状态、分支、暂存/提交、推拉、变更请求等。  
**非目标：** 不替代完整 IDE Git UI；不伪造无仓库能力。

## 用户路径

- 看状态与分支菜单 → 切换/创建分支 → stage/commit → push/pull → 开变更请求（若配置允许）。  
- Diff surface 与工作区一致。

## 架构要点

- `git.js` 门面 + `git-exec.js`、`git-diff.js`、`git-remotes.js`、`git-pullrequest.js` 等。  
- 进度事件 `shell:git-progress`。

## 实现入口

- `src/main/git.js` 及同前缀模块
- Preload：`gitStatus`、`gitCommit`、`gitPush` 等

## 不变量

- 行为对齐桌面已定 T3/标题栏契约；非仓库时降级而非假成功。
- `shell:git-*` handler 抛错经 `git-ipc-guard.js` 兜底为该通道失败载荷（状态/diff → `null`，其余 → `{ok:false,message}`），renderer invoke 不 reject；进度 toast 不卡 loading。
- 切换到无本地同名的远端行走 `checkout --track --ignore-other-worktrees`，建本地跟踪分支而非 detached HEAD。
- 分支列表 IPC 失败在菜单内区分错误与空列表（vendor ui-git `branch.listFailed`）。
- Android 工作区胶囊走同一套 git IPC：已登录 `POST /__remote__/shell/git*`，不把 PTY / `writeFile` 暴露给手机。
- Git cwd 授权读桌面 `dsh-home` 的工作区登记，允许启动目录的兄弟项目；拒绝把盘符根（`C:\`、`/`）写入白名单。

## 门槛

- QA：`TC-GIT-001` … `TC-GIT-007`

## 延伸阅读

- Feature：[../../features/git-titlebar.md](../../features/git-titlebar.md)
- [../superpowers/specs/2026-08-18-t3-git-tool-verbatim-leftovers-design.md](../../superpowers/specs/2026-08-18-t3-git-tool-verbatim-leftovers-design.md)
