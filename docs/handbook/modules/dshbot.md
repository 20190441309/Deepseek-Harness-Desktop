# 模块：dshbot

## 职责与非目标

**职责：** 侧栏 Bot 联系人与群房间（编码协作花名册）；启动时 `ensureDshbotPlugin` 预置进 web profile；群协议按 Grok 符号契约（peer-equal turn、since-last-spoke、epoch abort）。  
**非目标：** 独立聊天产品壳；云电脑 / Shared Room / Routines / 真 multi-lane interrupt / 富 SendMessage（本史诗不做）；非官方视觉扩散。

## 用户路径

- 启动后侧栏有「机器人 / Bots」页签：建 Bot、建群（名称 + description + 1–6 成员，无建群头像编辑器）、打开 1:1 或群。  
- 契约见 Feature 卡 `dshbot` 与 `TC-EXT-007`（正向）。

## 架构要点

- `ensureDshbotPlugin` 拷贝源、房间 preset、managed cordis 块；`hideDshbotPlugin` 仅调试/回滚。  
- 纯协议：`lib/group-chat.js`；循环：`group-chat-orchestrator.js`；建群/成员/epoch：`group-chat-host.js`。  
- 房间推进仍借 Harness `llm/stream` → 链式 `ask_participant`；提示与历史来自 Grok 纯函数，无 first/later。  
- A2A：`send_to_agent` 可 post 进群；priority 仅队列序。  
- 插件源在 `vendor/dshbot`。

## 实现入口

- `src/main/dshbot-preset.js`、`harness-controller.js`  
- `vendor/dshbot/lib/{group-chat,group-chat-orchestrator,group-chat-host,ask-participant,agent-messaging,send-to-agent,index}.js`  
- `vendor/dshbot/client/client.js`

## 不变量

- Feature card：[../../features/dshbot.md](../../features/dshbot.md)  
- 无 `speakerSeat` / later 默认 pass / `NEXT:` 调度 / 建群 AvatarEditor / 房间头像 thinking-bounce。  
- 预置源随桌面交付。

## 门槛

- Automated：`dshbot-*.test.js`、`harness-controller`、`release-ui-walk`；`plugin.dshbot.tab`  
- QA：`TC-EXT-007`

## 延伸阅读

- [../../features/dshbot.md](../../features/dshbot.md)  
- [../../superpowers/specs/2026-08-19-dshbot-design.md](../../superpowers/specs/2026-08-19-dshbot-design.md)
