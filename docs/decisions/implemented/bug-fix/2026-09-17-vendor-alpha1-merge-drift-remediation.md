# Decision: dsh-v0.1.6-alpha.1 合并漂移按「上游契约优先、桌面特性保真」裁定

Status: implemented

中文 | [English](2026-09-17-vendor-alpha1-merge-drift-remediation.en.md)

## Problem

alpha.1 合入后 vendor GUI 套件 16 处失败——这批 spec 自合入起未在 CI 跑过，失败混着三种性质：上游已改契约而本地实现滞后、桌面有意特性把 spec 的旧断言顶破、以及真正的代码缺陷。逐处拍脑袋会把真回归和上游演进混为一谈，需要一条统一裁定规则。

## Decision

按「上游契约优先、桌面特性保真」裁定每一处失败：上游已改的契约跟上游，桌面有意引入的特性保留实现并改 spec 到等价断言，真缺陷修真缺陷。

- 持久键 `dsh.workspace.view` 回到上游 `v5`（丢弃桌面遗留 `v6`，接受一次性视图偏好重置）；`WorkspaceBrowser` 手动排序换回上游 summary 感知的 `reconcileManualOrder(…, list.byId)`，恢复到达序与迟来空会话语义。
- 界面设置连接区文案回到上游（`连接异常，刷新重试` / `重新连接中`）——package README.zh 本就记录该文案，本地串是 rc.1 合并残留，不是有意定制。
- 桌面自有特性保留实现：FlipText 翻牌标签（spec 改为断言剥离 `aria-hidden` 后的可访问文本，等价于原断言）、composer pick 持有到投影落地（spec 改为模拟投影帧到达后再断言 enabled）、managed presentation 会话、`dshbot-room` 隐藏、`custom-instructions` 设置行；上游 `+` 启动器合并了旧「指令」「添加附件」两颗 chip，相关断言改到现行文案 `添加文件或调用指令`。
- 真缺陷修复：`ConversationContent` 的 `heroWorkspaceRow` 提前构造会无条件触发 `conversation.hero.workspace` slot（JSX 子表达式在构造时即求值），presentation-owned 会话不应实例化工作区选择器——改为 `hero` 门控构造；`TerminalCleanup .stack` 补 `-webkit-app-region: no-drag`（fixed 交互层规则缺口）；pdf-license spec 在 Windows 用相对文件名解 tar（bsdtar 把 `C:` 前缀当远端主机）。

## Alternatives considered

- **全部退回上游实现** — rejected：FlipText、pick-hold、managed presentation 等是桌面有意特性，退回等于撤销已验收的产品行为。
- **放宽断言到 `toContain` 或删除** — rejected：削弱断言会掩盖同类的下一次真回归；可访问文本断言与原契约等价，不损失强度。
- **保留 `v6` 持久键** — rejected：与上游键名永久分叉，且上游对该键的 schema 语义已重构（去掉时间戳账本）；继续用 `v6` 只会把分歧带进下一次合并。

## Consequences

一次性代价：存量用户的工作区视图偏好（排序方式与手动排序）重置为默认，不丢数据。spec 更新绑定桌面特性的现行契约——FlipText 动画期内旧文案以 `aria-hidden` 挂载、pick 持有到投影帧、`conversation.hero.workspace` 不再为 presentation-owned 会话实例化。vendor GUI 套件回到全绿，`test.yml` 门禁解锁，release 候选构建可以继续。
