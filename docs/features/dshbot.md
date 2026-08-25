# Feature: dshbot

| Field | Value |
| --- | --- |
| **id** | `dshbot` |
| **status** | `standalone`（独立可发布 dsh 插件；桌面默认**不装**、不预置；市场一键安装） |
| **last verified** | 2026-08-25 — npm 发布链路落地（publishConfig+LICENSE、`publish-dshbot.yml` tag 触发、`check-dshbot-publish.mjs` 预检、`dshbot-publish-manifest.test.js` 门禁）；TC-EXT-007 执行手册 `docs/qa/tc-ext-007-dshbot-install-smoke.md` 就绪，实机仍阻塞（见 Open follow-ups）。此前：standalone 拆除 + 市场第一方行 + inbox/epoch 韧性 |

## User paths

1. 默认桌面：侧栏**没有**「机器人 / Bots」页签——dshbot 不再随桌面预置。
2. 产品内安装：设置 → 插件市场列出第一方 `ChisaAlter/dshbot` 行（本地合并，不等外部 registry 收录），一键安装走 curated 目录通道，规格 `github:ChisaAlter/Deepseek-Harness-Desktop#path:/vendor/dshbot`。
3. CLI 安装（官方插件通道）：上面 `#path:` 规格、`dsh plugin --profile web add dshbot@<semver>`（发布后）或镜像 `github:` 规格；插件首载时自装 `dshbot-room` preset 到 `$DSH_HOME/.agent-presets/`，侧栏出现 Bots 页签。
4. 卸载：`dsh plugin remove dshbot`（或市场「已安装」移除）→ 页签消失；桌面启动清理会移除无主的 preset 目录与旧版桌面预置残留（managed patch 块、`desktop-plugins/dshbot` 拷贝、预置软链）。
5. 开发：桌面 config 写 `dshbotPreset: true` → 启动时把工作区 `vendor/dshbot` 拷入 profile（失败仅记日志，不阻断启动）。

## Invariants

- 桌面**从不**强制 ensure dshbot，启动也**从不**因 dshbot 失败而阻断。默认（含 `--skip-user-plugins`）走 `removeDshbotPreset` 清残留；仅 config `dshbotPreset: true` 且非 skip 时走开发预置（log-only）。
- `removeDshbotPreset` 不碰用户安装：真实 `node_modules/dshbot`、profile `dependencies`/`bundles` 一律保留；只删指向 `desktop-plugins/dshbot` 的软链；`.agent-presets/dshbot-room` 仅在无任何 dshbot 安装时删除。
- 插件包（`vendor/dshbot`）可独立发布：无 `private`，带 repository/homepage；`lib/room-preset.js` 在 apply 时自装房间 preset（幂等、字节级刷新）。
- 市场第一方行：`marketplace-catalog.js` 把 `FIRST_PARTY_PLUGINS` 的 dshbot 行合并进每个目录 payload（live/cache/snapshot）与 `getMarketplacePlugin`；registry 同 id 行覆盖第一方行；Host `installPlugin` 通道保持 github-only，`#path:` 只走 curated `installMarketplacePlugin(id)`。
- A2A inbox 投递 at-least-once：assemble 只 PEEK（`lib/inbox-drain.js`），ack 在消费该 peek 的 turn 之后；peek 与 ack 之间崩溃/重启只丢进程内快照、不丢消息（下次 assemble 重投）；ack 幂等，重复注入 drain listener 不会双删；peek 后新到消息在 ack 后保留。
- 房间 turn epoch 进程内单调：崩溃重启从 0 重新起算，崩溃前铸出的 epoch token 永远过期（stale member turn 无法回写）。
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
- 市场行是桌面本地第一方合并，外部 registry 收录后以 registry 行为准；`#path:` 规格未钉 SHA 时装 main 分支最新（存有 GitHub token 时安装通道自动钉 SHA）。
- avatar 助手在 lib 与 client 各一份（client 无法 import 服务端 ESM）；单测锁两份 lockstep。

## Open follow-ups（未完成 · 已文档落地，不挡本卡合并）

生产交付仍缺、须后续迭代关闭的项（优先级从高到低）：

| Pri | 项 | 验收 |
| --- | --- | --- |
| P0 | **安装包实机冒烟** `TC-EXT-007`：对 CI windows 安装包跑「默认无页签 → 市场一键装 → 建群冒烟 → 卸载重启无残留」。**阻塞原因（2026-08-25）：** 云端 Linux 环境跑不了 Windows NSIS 安装包/GUI；执行手册已脚本化到「拿到下一 CI artifact 一键执行」：[docs/qa/tc-ext-007-dshbot-install-smoke.md](../qa/tc-ext-007-dshbot-install-smoke.md)（A/C 两相走 `run-packaged-smoke.mjs` 的 `plugin.dshbot.*` 探针，建群冒烟为唯一手工步骤） | 汇总表 TC-EXT-007 填 Pass + CI SHA；不得用旧「停放 Pass」冒充 |
| P1 | **npm 独立发布** `dshbot@<semver>`：发布链路已落地——`publishConfig.access=public` + LICENSE、tag `dshbot-v<semver>` 触发 `.github/workflows/publish-dshbot.yml`（预检 `scripts/check-dshbot-publish.mjs` + `npm publish --provenance`）、桌面套件 `dshbot-publish-manifest.test.js` 锁 manifest。**剩余缺口：** 仓库未配 `NPM_TOKEN` secret（无 registry 凭证），workflow 会明确报错而非半发；配好 token 后推 tag 即发 | 首个 `dshbot-v0.2.0` tag 发布成功；README / 发布说明写清 `dsh plugin add dshbot@x.y.z` 规格；registry 收录后第一方行可删或让位 |
| P1 | ~~**设计 spec 废弃段**~~ | **已落地（2026-08-25）：** spec 文首与决定 2 标 Deprecated；以 Grok-aligned 段与本卡为准 |
| P2 | **成员全工具房间**：解 `toolFilter` 限制时同步改 `buildGroupMemberSystemPrompt`；另开 feature 卡，本史诗不做 | 新卡 + 单测锁 prompt/toolFilter 同口径 |
| P2 | **Grok 未搬能力**（明确不做直至新卡）：exclusive room job / runner interrupt / Shared Room / Routines / 云电脑 / 富 SendMessage / 真 multi-lane interrupt | 新史诗卡批准前禁止静默实现 |

## Allowed touch

- `src/main/dshbot-preset.js`、`harness-controller.js`、`index.js`、`plugin-forensics.js`
- `src/main/marketplace-catalog.js` 的 `FIRST_PARTY_PLUGINS` dshbot 行（及 `marketplace-catalog.test.js` 计数随动）
- `src/main/release-ui-walk.js` 与 `dshbot-*.test.js`
- `vendor/dshbot/**`
- 根 `package.json` 的 dshbot extraResources 项（已移除）
- 发布链路：`scripts/check-dshbot-publish.mjs`、`.github/workflows/publish-dshbot.yml`（2026-08-25 扩围：npm 发布交付件）
- 本卡、`docs/handbook/modules/dshbot.md`、`docs/qa` 的 `TC-EXT-007`（含执行手册 `tc-ext-007-dshbot-install-smoke.md`）

## Gates

| Kind | What |
| --- | --- |
| Automated | `dshbot-preset`（ensure/remove 语义）、`dshbot-room-preset`（自装）、`dshbot-market-row`（第一方目录行 + curated `#path:` 安装 + Host 通道拒绝）、`dshbot-runtime-resilience`（epoch 重启 / inbox at-least-once / ack 幂等）、`dshbot-publish-manifest`（发布 manifest 完整性 + 预检脚本 tag 校验）、`harness-controller`（清理/开发预置/skip）、`release-ui-walk` `plugin.dshbot.tabAbsent`（未装则缺席、已装则允许）；catalog/group 单测锁协议与诚实 prompt |
| Manual | 未装：无 Bots 页签、启动正常；市场一键或 `dsh plugin add` 安装后：页签出现、可建群；卸载后重启：页签消失、无残留 |

## Sources

- Handbook：[../handbook/modules/dshbot.md](../handbook/modules/dshbot.md)
- Spec：[../superpowers/specs/2026-08-19-dshbot-design.md](../superpowers/specs/2026-08-19-dshbot-design.md)
- 参考：[grok-bot-0.18-reconstructed](https://github.com/b-nnett/grok-bot-0.18-reconstructed)（`source/host/groups/group-chat.ts`、`source/host/agents/agent-messaging.ts`）
- Implementation：`vendor/dshbot/lib/{group-chat,group-chat-host,ask-participant,agent-messaging,room-preset,index}.js`
