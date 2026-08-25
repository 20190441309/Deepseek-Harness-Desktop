# Feature: dshbot

| Field | Value |
| --- | --- |
| **id** | `dshbot` |
| **status** | `standalone`（独立可发布 dsh 插件；桌面默认**不装**、不预置） |
| **last verified** | 2026-08-25 — 拆除 vendor 强绑；默认启动清理预置残留；插件包可独立发布 |

## User paths

1. 默认桌面：侧栏**没有**「机器人 / Bots」页签——dshbot 不再随桌面预置。
2. 安装（官方插件通道）：`dsh plugin --profile web add dshbot@<semver>`（发布后）或 `github:` 规格；插件首载时自装 `dshbot-room` preset 到 `$DSH_HOME/.agent-presets/`，侧栏出现 Bots 页签。
3. 卸载：`dsh plugin remove dshbot` → 页签消失；桌面启动清理会移除无主的 preset 目录与旧版桌面预置残留（managed patch 块、`desktop-plugins/dshbot` 拷贝、预置软链）。
4. 开发：桌面 config 写 `dshbotPreset: true` → 启动时把工作区 `vendor/dshbot` 拷入 profile（失败仅记日志，不阻断启动）。

## Invariants

- 桌面**从不**强制 ensure dshbot，启动也**从不**因 dshbot 失败而阻断。默认（含 `--skip-user-plugins`）走 `removeDshbotPreset` 清残留；仅 config `dshbotPreset: true` 且非 skip 时走开发预置（log-only）。
- `removeDshbotPreset` 不碰用户安装：真实 `node_modules/dshbot`、profile `dependencies`/`bundles` 一律保留；只删指向 `desktop-plugins/dshbot` 的软链；`.agent-presets/dshbot-room` 仅在无任何 dshbot 安装时删除。
- 插件包（`vendor/dshbot`）可独立发布：无 `private`，带 repository/homepage；`lib/room-preset.js` 在 apply 时自装房间 preset（幂等、字节级刷新）。
- 群父会话不调聊天模型；可见气泡仅用户消息与成员投递（`send_room_message`，`(pass)` 静默）。
- 协议常量：`GROUP_MAX_MEMBERS=6`、`GROUP_MAX_ROUNDS=3`、`GROUP_MAX_MEMBER_TURNS=10`、`GROUP_MAX_MESSAGES_PER_TURN=2`、`GROUP_PROMPT_HISTORY_LIMIT=24`。
- 成员 system prompt 与 toolFilter 一致：talking-circle 措辞，明说 `send_room_message` 是唯一工具（不再谎称 full toolkit）。
- 无 `speakerSeat` / later 默认 pass / `NEXT:` 调度 / redrive（`buildGroupRedriveNote` 已删）/ 平行 `GroupChatOrchestrator`（已删，事件链调度是唯一实现）。
- 1:1 系统提示含 teammates 目录段（`dshbot:teammates`，Grok agent-directory），列可 `send_to_agent` 的同伴与所在群；hidden bot 不列。
- `origin: 'dshbot'` 会话对工作区列表隐藏。
- 本史诗不做：Routines、云电脑、Shared Room、富 SendMessage、真 multi-lane interrupt。

## Known limitations（诚实边界）

- 房间推进仍借 Harness `llm/stream` → 链式 `ask_participant`；对齐 Grok orchestrator 算法，不是 Grok exclusive room job。
- 无 runner interrupt / redrive；priority 仅队列序。
- 成员 turn `toolFilter` 仅 `send_room_message`（Talking Circle）；全工具另卡。
- 桌面壳没有 dshbot 的市场目录行（外部 registry 收录后自然出现）；当前产品内安装通道为官方 `dsh plugin add` 规格。
- avatar 助手在 lib 与 client 各一份（client 无法 import 服务端 ESM）；单测锁两份 lockstep。

## Allowed touch

- `src/main/dshbot-preset.js`、`harness-controller.js`、`index.js`、`plugin-forensics.js`
- `src/main/release-ui-walk.js` 与 `dshbot-*.test.js`
- `vendor/dshbot/**`
- 根 `package.json` 的 dshbot extraResources 项（已移除）
- 本卡、`docs/handbook/modules/dshbot.md`、`docs/qa` 的 `TC-EXT-007`

## Gates

| Kind | What |
| --- | --- |
| Automated | `dshbot-preset`（ensure/remove 语义）、`dshbot-room-preset`（自装）、`harness-controller`（清理/开发预置/skip）、`release-ui-walk` `plugin.dshbot.tabAbsent`（未装则缺席、已装则允许）；catalog/group 单测锁协议与诚实 prompt |
| Manual | 未装：无 Bots 页签、启动正常；`dsh plugin add` 安装后：页签出现、可建群；卸载后重启：页签消失、无残留 |

## Sources

- Handbook：[../handbook/modules/dshbot.md](../handbook/modules/dshbot.md)
- Spec：[../superpowers/specs/2026-08-19-dshbot-design.md](../superpowers/specs/2026-08-19-dshbot-design.md)
- 参考：[grok-bot-0.18-reconstructed](https://github.com/b-nnett/grok-bot-0.18-reconstructed)（`source/host/groups/group-chat.ts`、`source/host/agents/agent-messaging.ts`）
- Implementation：`vendor/dshbot/lib/{group-chat,group-chat-host,ask-participant,agent-messaging,room-preset,index}.js`
