# 模块：dshbot

## 职责与非目标

**职责：** 独立可发布的 dsh 插件（`vendor/dshbot` 为源）：侧栏 Bot 联系人与群房间；群协议按 Grok 符号契约（peer-equal turn、since-last-spoke、epoch abort）。桌面壳只负责：默认启动清理旧预置残留、config 开关的开发预置。  
**非目标：** 桌面强绑预置（已拆除）；独立聊天产品壳；云电脑 / Shared Room / Routines / 真 multi-lane interrupt / 富 SendMessage；非官方视觉扩散。

## 用户路径

- 默认无 Bots 页签。设置 → 插件市场第一方行一键安装，或 `dsh plugin add`（`github:ChisaAlter/Deepseek-Harness-Desktop#path:/vendor/dshbot`）；装后建 Bot、建群（名称 + description + 1–6 成员）、打开 1:1 或群；卸载后页签消失，桌面启动清无主 preset。
- 契约见 Feature 卡 `dshbot` 与 `TC-EXT-007`。

## 架构要点

- 插件自足：`lib/room-preset.js` 在 apply 时把 `presets/dshbot-room` 自装到 `$DSH_HOME/.agent-presets/`（幂等、字节级刷新），不依赖桌面拷贝。
- 桌面壳：`removeDshbotPreset` 清 managed patch 块、`desktop-plugins/dshbot` 拷贝、预置软链（仅指向拷贝的）、无主 preset；**不**碰用户安装（真实 node_modules、profile dependencies/bundles）。`ensureDshbotPlugin` 仅 config `dshbotPreset: true` 时跑，log-only。
- 纯协议：`lib/group-chat.js`；建群/成员/epoch：`group-chat-host.js`；调度唯一实现在 `catalog.js`（`nextRoomSpeakerId` 事件链）——平行 `GroupChatOrchestrator` 与 redrive 助手已删。
- 房间推进借 Harness `llm/stream` → 链式 `ask_participant`；成员 spawn `toolFilter` 仅 `send_room_message`，system prompt 同口径（talking-circle）。
- A2A：`send_to_agent` 可发同伴或 post 进群；priority 仅队列序；1:1 系统提示带 `dshbot:teammates` 目录段（Grok agent-directory 适配）。
- inbox drain 独立在无依赖的 `lib/inbox-drain.js`：assemble 只 PEEK、ack 在消费 turn 之后，at-least-once（崩溃重投、ack 幂等、重复注入不双删）。
- 插件源在 `vendor/dshbot`，可 `npm publish` / `dsh plugin add`；不再进 electron-builder extraResources；市场入口是 `marketplace-catalog.js` 的 `FIRST_PARTY_PLUGINS` 第一方行（registry 同 id 覆盖）。

## 实现入口

- `src/main/dshbot-preset.js`（ensure 开发预置 / removeDshbotPreset 清理）、`harness-controller.js`
- `vendor/dshbot/lib/{group-chat,group-chat-host,ask-participant,agent-messaging,send-to-agent,inbox-drain,room-preset,memory,catalog,index}.js`
- `vendor/dshbot/client/client.js`

## 不变量

- Feature card：[../../features/dshbot.md](../../features/dshbot.md)
- 桌面从不强制 ensure、从不因 dshbot 阻断启动；清理不碰用户安装。
- 无 `speakerSeat` / later 默认 pass / `NEXT:` 调度 / 建群 AvatarEditor / 房间头像 thinking-bounce。

## 门槛

- Automated：`dshbot-*.test.js`（含 room-preset 自装、market-row 目录行与安装通道、runtime-resilience epoch/inbox、prompt/toolFilter 一致、avatar lockstep、publish-manifest 发布完整性）、`harness-controller`、`release-ui-walk` `plugin.dshbot.tabAbsent`
- QA：`TC-EXT-007`（P1；汇总表待安装包实机填 Pass——执行手册 [../../qa/tc-ext-007-dshbot-install-smoke.md](../../qa/tc-ext-007-dshbot-install-smoke.md)）

## 未完成（文档落地）

详见 feature 卡 **Open follow-ups**：安装包实机冒烟（手册就绪、实机阻塞）、npm 独立发布（链路就绪、缺 `NPM_TOKEN`）、成员全工具另卡、Grok exclusive/interrupt/Shared Room 另史诗。

## 延伸阅读

- [../../features/dshbot.md](../../features/dshbot.md)
- [../../superpowers/specs/2026-08-19-dshbot-design.md](../../superpowers/specs/2026-08-19-dshbot-design.md)
