# Feature: 最新用户消息「撤回重编辑」（就地编辑并重发）

| Field | Value |
| --- | --- |
| **id** | `message-edit` |
| **status** | `active` |
| **last verified** | 2026-08-25 — `pnpm vitest run packages/client/ui-message-edit`（35 通过）+ `pnpm run test:gui` |

## User paths

1. 会话空闲时，最新一条用户消息的操作条出现铅笔（历史消息没有）；点击**不 fork**，气泡就地换成编辑器（textarea + 取消／发送），原文回填、焦点入框、光标在末尾。
2. Enter 发送、Shift+Enter 换行、Escape 取消，三者 IME 安全；取消恢复静态气泡并把焦点交还铅笔。
3. 发送执行 `sessions.fork({ beforeSeq, increaseTitle: true })` → 打开子会话 → `setDraft` → `submit`；源会话日志不变，子会话切在被编辑消息之前。
4. fork 失败／子作用域缺失：源 composer 出错误提示，编辑器带草稿继续待命，可重试或取消。
5. 会话运行中或消息含非文本块：铅笔可见但禁用，tooltip 说明原因；编辑中途会话开始运行或有更新的用户消息时，发送被阻止并在按钮旁说明。

## Invariants

- 铅笔只出现在**最新**已定稿用户消息上；点击铅笔不产生任何 Host 写入（首次写入是确认时的 fork）。
- 源会话日志不可变；子会话切点在被编辑轮次之前，模型不会重复看到旧提示词。
- 失败路径不丢草稿、不留 pending 锁死；「仅限最新 + 空闲」在确认时刻仍然成立（stale/running 守卫）。
- 编辑器几何与静态气泡一致（525px/82%、r22、16/24），编辑态描边用 box-shadow 不改几何；仅官方 tokens（`--dsw-alias-*`／`--dsw-specific-*`）。
- 底部 composer 在编辑期间保持可用；不占用 `conversation.blocks`。
- 文案中英齐备（`messageEdit` 命名空间）；产品文案中文、代码注释英文。

## Allowed touch

- `vendor/deepseek-harness/packages/client/ui-message-edit/` — 插件本体（铅笔、编辑器、store、文案、样式、测试）
- `vendor/deepseek-harness/packages/client/ui-conversation/src/client/chat/MessageItem.tsx` 与 `contract/slots.ts` 中 `user-actions`/`user-editor` 座位 — 仅在座位契约确需扩展时
- `vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-15-inline-user-message-edit*` 与 `2026-08-25-message-edit-production-polish*` — 事实保鲜

## Do not touch

- 不发明改写已定稿 `user/message` 的 Host API；不改会话日志格式。
- 不改 fork-beforeSeq 语义（撤回重编辑 = 子会话分支，不是原地改写）。
- 历史消息编辑、多模态（图片）编辑、trajectory/waterfall 视图 — 除非用户明确扩权。
- `MessageIconActions` 内不得出现编辑存根（已被 2026-07-31 简化记录移除）。

## Gates

| Kind | What |
| --- | --- |
| Automated | `pnpm vitest run packages/client/ui-message-edit`；`pnpm run test:gui`；触碰文件受 `test:coverage` per-file 100% 门槛 |
| Manual / QA | 发消息→等空闲→点铅笔→改字→发送：子会话出现并从新文本继续；取消恢复原气泡；运行中铅笔禁用 |

## Sources

- Agent Note: [2026-08-15-inline-user-message-edit](../../vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-15-inline-user-message-edit.md)、[2026-08-25-message-edit-production-polish](../../vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-25-message-edit-production-polish.md)
- Implementation entry: `vendor/deepseek-harness/packages/client/ui-message-edit/src/client/`
- Package README: [ui-message-edit README](../../vendor/deepseek-harness/packages/client/ui-message-edit/README.md)
