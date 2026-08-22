# Feature: dshbot（隐藏）

| Field | Value |
| --- | --- |
| **id** | `dshbot` |
| **status** | `parked`（侧栏入口隐藏；插件源仍随仓库打包） |
| **last verified** | 2026-08-22 — 启动路径改为 `hideDshbotPlugin`；单测 |

## User paths

1. 启动后侧栏**没有**「机器人 / Bots」页签，也打不开 bot 列表或群聊创建。
2. 设置 → 市场「已安装」不把 dshbot 当必现目录行。
3. 以后要重新打开：改回启动时调用 `ensureDshbotPlugin`，并先更新本卡为 `active`。

## Invariants

- 每次 Harness 启动在拉起 `dsh web` 前调用 `hideDshbotPlugin`：去掉 managed `cordis.patch.yml` 块，并从 web profile 的 `bundles` / `dependencies` 去掉 `dshbot`。
- `vendor/dshbot` 仍在仓库与安装包 extraResources 里；不删插件源。
- 已有 `origin: 'dshbot'` 会话继续被工作区会话列表隐藏；没有侧栏入口后用户也走不到它们。
- 不装插件时官方四栏侧栏与无 dshbot 的 `dsh web` 一致。

## Allowed touch

- `src/main/dshbot-preset.js`、`harness-controller.js`、`index.js`（启动接线）
- `src/main/release-ui-walk.js` 与对应单测
- 本卡、`docs/handbook/modules/dshbot.md`、`docs/qa/production-acceptance-test-cases.md` 的 `TC-EXT-007`

## Do not touch

- 删除 `vendor/dshbot/` 或房间 preset 源
- 官方四栏布局、composer `@`/`$`、市场安装流程（除非用户扩大 `Touching`）

## Gates

| Kind | What |
| --- | --- |
| Automated | `src/main/dshbot-preset.test.js`、`harness-controller.test.js`、`release-ui-walk.test.js`；`qa:source` 的 `plugin.dshbot.tabAbsent` |
| Manual / QA | `TC-EXT-007`（负向：侧栏无入口） |

## Sources

- Handbook：[../handbook/modules/dshbot.md](../handbook/modules/dshbot.md)
- Spec（停放前设计）：[../superpowers/specs/2026-08-19-dshbot-design.md](../superpowers/specs/2026-08-19-dshbot-design.md)
- Implementation entry：`src/main/dshbot-preset.js` `hideDshbotPlugin`
