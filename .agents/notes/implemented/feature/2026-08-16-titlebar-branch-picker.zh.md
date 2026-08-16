# Agent Note: 从 T3code 移植的标题栏分支选择器

Status: implemented

[English](2026-08-16-titlebar-branch-picker.md) | 中文

## 问题

标题栏 Git 簇已能提交、推送、开变更请求，但切换或新建分支仍要绕道终端。T3code 自带一个分支选择器（搜索、内联新建、远程去重），本产品想要它完整的交互模型；但它的组件栈（Tailwind、shadcn、lucide、zustand、服务端持有 worktree）无法直接贴进本设计系统。

## 决策

分三层移植。纯逻辑直接取自 T3code（MIT，© T3 Tools Inc.）：`deriveLocalBranchNameFromRemoteRef`、`dedupeRemoteBranchesWithLocalMatches`、`shouldIncludeBranchPickerItem` 落在 `ui-git/src/client/branches.ts`，Effect/t3 导入改写为普通 TypeScript，行为保持不变。交互照 T3code：触发器显示当前引用，面板随输入搜索，未知查询给出「新建分支『…』」，已有本地分支的 `origin/*` 行隐藏，当前行禁用，操作失败时面板保持打开并显示错误行而不是无声关闭。外观归本系统：`Button`/`Input` 原子、`--dsw-alias-*` token，以及抬升滚动面板的共享滚动条重绑。

后端新增三条桌面 IPC——`shell:git-branch-list`（`for-each-ref` + `symbolic-ref` 取 origin/HEAD 默认分支）、`shell:git-switch-branch`（`git checkout`）、`shell:git-create-branch`（`git checkout -b`）——与其余 git 操作一样全部经 `workspace-authority` 根授权。引用名先过 `^[A-Za-z0-9][A-Za-z0-9._/-]*$` 校验并拒绝 `..`、`.lock`、尾斜杠，才进 argv，模型传入的引用无法夹带选项或路径穿越。

T3code 的 worktree 多环境与线程↔分支绑定**有意不移植**：它们焊死在 T3code 的服务端线程元数据（按线程的 `worktreePath`、env mode、切换时停会话）。本 harness 没有这样的会话元数据；只搬选择器一半而不搬生命周期等于撒谎。它们留作后续 harness 原生设计的候选。

## 曾考虑的替代方案

**整块粘贴 T3code 组件。** 否决：Tailwind/shadcn/lucide/zustand 违反强制的 dsw 设计语言、slot catalog 与 lint 门禁；组件还依赖这里不存在的 T3code 服务端 atom。

**只用终端做分支操作。** 否决：标题栏已拥有 Git 闭环（提交/推送/PR）；最高频的引用操作绕道终端会打断这个闭环。

**连 worktree/env-mode 一起移植。** 暂缓：需要授权根内的按会话分支元数据与 worktree 生命周期管理——那是设计决策，不是移植。

## 后果

标题栏 Git 簇现在是完整的引用闭环：切换、新建、提交、推送、变更请求。`git.test.js` 钉住 list/switch/create 往返与不安全引用拒绝；`branch-menu.client.spec.tsx` 钉住移植的纯函数与面板交互（搜索、新建行、切换回调、失败保持面板打开）。选择器只在会话 cwd 是仓库时渲染；非 git 目录保持隐藏，初始化 Git 流程不受影响。

## 相关

[桌面 surfaces 集成加固](../architecture/2026-08-15-desktop-surfaces-integration-hardening.md) 拥有本选择器路由经过的 workspace-authority 根。T3code（`C:\ai\t3code`，MIT）是行为来源；`apps/web/src/components/BranchToolbarBranchSelector.tsx` 与 `packages/shared/src/git.ts` 是上游文件。
