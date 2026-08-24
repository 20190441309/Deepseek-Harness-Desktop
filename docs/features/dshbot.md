# Feature: dshbot

| Field | Value |
| --- | --- |
| **id** | `dshbot` |
| **status** | `parked`（侧栏 Bots 隐藏；`DSHBOT_FEATURE_ENABLED = false`） |
| **last verified** | 2026-08-24 — 与远程同样停放；`hideDshbotPlugin` 于每次启动 |

## User paths

1. 启动后侧栏**没有**「机器人 / Bots」页签（产品停放；源码仍在 `vendor/dshbot`）。
2. 以后要重新打开：把 `src/main/dshbot-preset.js` 的 `DSHBOT_FEATURE_ENABLED` 改回 `true`，并先把本卡改为 `active`。

## Invariants

- 完整启动：`DSHBOT_FEATURE_ENABLED === false` 时只 `hideDshbotPlugin`；为 `true` 时 `ensureDshbotPlugin` 失败阻断。`--skip-user-plugins` 亦 hide。
- 群父会话不调聊天模型；可见气泡仅用户消息与成员投递。
- 协议常量：`GROUP_MAX_MEMBERS=6`、`GROUP_MAX_ROUNDS=3`、`GROUP_MAX_MEMBER_TURNS=10`、`GROUP_MAX_MESSAGES_PER_TURN=2`、`GROUP_PROMPT_HISTORY_LIMIT=24`。
- 无 `speakerSeat` / later 默认 pass / `NEXT:` 调度 / 未接线 `memberChildren`。
- `origin: 'dshbot'` 会话对工作区列表隐藏。
- 本史诗不做：Routines、云电脑、Shared Room、富 SendMessage、真 multi-lane interrupt。

## Known limitations（诚实边界）

- 房间推进仍借 Harness `llm/stream` → 链式 `ask_participant`；算法对齐 Grok orchestrator，不是 Grok `runLifecycle` exclusive room job。
- 无 runner interrupt / redrive；priority 文案可提 interrupt，能力为排队。
- 无一等公民多作者 streaming seal；侧栏用活动角标，房间头像不 thinking-bounce。
- 成员 turn 当前 `toolFilter` 仅 `send_room_message`（Talking Circle）；全工具另卡。

## Allowed touch

- `src/main/dshbot-preset.js`、`harness-controller.js`、`index.js`
- `src/main/release-ui-walk.js` 与 `dshbot-*.test.js`
- `vendor/dshbot/**`
- 本卡、`docs/handbook/modules/dshbot.md`、`docs/qa` 的 `TC-EXT-007`

## Gates

| Kind | What |
| --- | --- |
| Automated | `dshbot-preset`、`release-ui-walk` `plugin.dshbot.tabAbsent`；catalog/group 单测仍锁协议 |
| Manual | **N/A**（停放）；原 Bot/群聊手测待 re-enable |

## Sources

- Handbook：[../handbook/modules/dshbot.md](../handbook/modules/dshbot.md)
- Spec：[../superpowers/specs/2026-08-19-dshbot-design.md](../superpowers/specs/2026-08-19-dshbot-design.md)
- Implementation：`vendor/dshbot/lib/{group-chat,group-chat-orchestrator,group-chat-host,ask-participant,index}.js`
