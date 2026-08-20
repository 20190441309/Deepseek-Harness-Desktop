# Agent Note: Sidebar region tabs, dshbot session origin, and session-only model selection

Status: implemented

[English](2026-08-19-sidebar-tabs-dshbot-origin.md) | 中文

## Problem

左侧栏曾是封闭的几何壳：插件只能整表替换 `sidebar.workspaces`，桌面联系人列表无法与官方会话浏览器并列。为这些联系人创建的会话还会出现在项目列表里，而且 `session.selectModel` 总会写入用户的全局默认模型。

## Decision

`ui-sidebar` 声明 list 洞 `sidebar.nav.tab` 和 keyed 洞 `sidebar.page`。占用是绘制选项卡条的唯一信号；零贡献时保持 New Session 与 `sidebar.workspaces`，不多画控件。选中插件 Tab 时隐藏 New Session，区域由与 tab id 相同的 `sidebar.page` 填充。Tab 组件不会被挂载；外壳从 list 账本读取 `id` / `label` / `order`。导航 store 持久化 `selectedTab`，在已存 id 消失时回退到 `sessions`。

`SessionHeader.origin` 为 `'subagent' | 'dshbot'`。`session.create` 只能打上 `origin: 'dshbot'`；`subagent` 仍由子 Agent 启动持有。列表汇总携带 origin，`sessionVisible` 把两者都藏起来。客户端 `SessionManager.create` 转发 `origin` 和 `agentPreset`，并打在乐观行上，避免 dshbot 会话在工作区列表里闪一下。ConversationRoot 对 `origin: 'dshbot'` 跳过 EmptyHero，即使日志仍空：会话顶栏保持可见，composer 停在底部，ChatView 可以填充 `conversation.chat.empty`。`connectWorkspace` 与 `connectNoDirectory` 拒绝复用 origin 为 `dshbot` 或 `subagent` 的空白行。会话顶栏的 agent-preset 标签在 `origin: 'dshbot'` 时隐藏。

`session.selectModel` 接受 `persistDefault`（默认 `true`）。传 `false` 只改该会话，不写 `agent-default-model`。

房间是 WhatsApp 式共享 transcript：可见气泡只有用户和成员。选人用代码（`@名字` 或全体），`llm/stream` 短路按顺序每次只产出一个 `ask_participant`，从不调用聊天模型。首轮是被 @ 的成员，否则按目录顺序全员；成员回复末行 `NEXT: pass` / `done` / `all` / `@名字` 由事件重放入队，首轮未完成时忽略 `all` 和点名，`done` 立即停，上限是插件 `Config` 的 `maxSpeaks` / `maxRounds`（默认 12 / 4）。队列空了是 empty stop。每个成员的 prompt 是剥掉 `NEXT:` 后、到自己开口为止的 `[名字]` 群日志，再加上座位 `speakInstruction`：首位回答用户；后到者看到本轮已有正文，默认整段只能是 `NEXT: pass`，除非人设能补纠正、反对或一个新点。空描述的 later 座位写明没有独特信息、应当 pass。编辑资料提供互不重叠的人设芯片（反对 / 补全 / 落地 / 毒舌）。人设不把 `NEXT: all` 写成首轮默认。`ask_participant` 用 one-shot spawn 子 Agent，等待 `SubagentRun.result` 后 dispose。成员气泡把头像放在独立文本芯片外，等待时显示「思考中」，只有调度脚注的 `pass` 不画。房间 ChatView 不画上下文注入、`Deep diving...`、turn-tail；InputBar 再藏 `+`、plan、ContextMeter、`$`。`@` 只出 dshbot 成员；房间里文件/子智能体/cordis/`/` 候选为空。InputBar 在 `origin` 为 `dshbot` 或 `agentPreset` 为 `dshbot-room` 时不渲染 `conversation.input.model`。一对一 Bot 只在编辑资料里改模型。侧栏上名字、下模型（空则「使用部署默认」）；群聊无预览行，头像带「群」角标。房间 `llm/stream` 调度闭包 `apply` 的 Config（`maxSpeaks` / `maxRounds`），不在 session fiber 上读 `ctx.config`。插件把 `dshbot-room` 打到每个目录房间的会话列表行上，这样即使 host 汇总漏了 preset，ChatView 与 InputBar 仍会藏房间铬。

目录项可以带 `avatar`：小人 `{ kind: 'blob', shape, color }` 或烘焙图 `{ kind: 'image', dataUrl, crop }`。缺记录时用条目 id 或名字哈希落到八种形体之一。编辑 `Modal` 里选形状和颜色，或上传后裁成圆/方并烘焙成小 JPEG。侧栏行在 `session.running` 时进入思考态；`ask_participant` 气泡在工具还没有 result 时进入思考态。不做 Generate，也不做头像商店。

DeepSeek Harness Desktop 在 `dsh.start()` 之前把 `vendor/dshbot` 复制进 web profile，方式与安装 `dshmarket` 相同，并把 `dshbot-room` agent preset 写到 `$DSH_HOME/.agent-presets`。`--skip-user-plugins` 恢复启动会跳过该 profile 补丁，与现有桌面插件跳过行为一致。

## Alternatives considered

**用 Bot 列表占用 `sidebar.workspaces`。** 该 single 洞会整表替换官方项目/会话浏览器，且插件不能 import `WorkspaceBrowser`。

**把 Bot 设置放到右侧 surfaces。** Surfaces 是工作循环（Files / Browser / Diff），不是 IM 资料编辑器。编辑 UI 走 `shell.overlay` 和 `Modal`。

**让多个模型写同一条 agent-loop。** 一会话即一 Agent。房间是技术父级，其 preset 工具按成员模型启动一次性子 Agent。

**让 LLM 父会话挑选下一个说话人。** 那是 AutoGen SelectorGroupChat，也是 Muse Spark 当调度员的失败模式。选人留在代码里。

**把 dshbot 做成官方 `packages/client` 包。** 会把 IM 产品绑进 100% 覆盖率门禁和 web-app 名册，使每次 `dsh web` 都带上它。桌面改为复制一份 vendored 插件。

**给 1:1 Bot 会话打 `origin: 'subagent'`。** subagent origin 是隐藏子会话的谱系。dshbot 联系人是父对话，必须离开工作区列表，又不能加入那条谱系。

**把空的 dshbot 日志推导成 `composerPhase: 'active'`。** 空日志位和首次 prompt 的 engaging 路径仍由 `derivePhase` 负责。origin 只跳过新对话外观和空白复用。

## Consequences

不装桌面插件时，官方 Web 外观不变。桌面用户看到「机器人」选项卡，其会话不出现在项目列表。保存 Bot 模型不会改动编码会话的默认模型。dshbot 插件全局注册 `ask_participant`；`dshbot-room` preset 把房间 agent 限制为该工具。非目录房间的调用者执行会失败。房间会话本身不说话；成员收到 named 群日志和 first/later 座位指令后以第一人称回答，并以 `NEXT:` 脚注让代码重放入队。后到座位在没有独特补充时默认只回 `NEXT: pass`。`ask_participant` 卡片在外侧头像旁显示目录名和该成员的可见正文；拉起的成员使用完整人设，不继承 harness 身份句。dshbot composer 没有模型座位；房间再没有命令、plan、meter、`$`，`@` 只列出成员。一对一 Bot 的模型来自编辑资料。Bot 与群聊行显示目录头像（小人或裁切图）；小人在该会话 running 时变形。打开从未发过消息的联系人或房间时，显示会话顶栏和成员名单，而不是新对话 Hero。New Session 不会落到这些空白行上。

## Testing

`packages/client/ui-sidebar/tests` 钉住无选项卡条时的外观与插件 Tab 区域切换。`packages/client/ui-workspace/tests/tree.client.spec.ts` 隐藏 `origin: 'dshbot'`。`packages/host/apiproxy/tests/api-proxy-models.spec.ts` 钉住 `persistDefault: false`。`packages/client/runtime/tests/manager.client.spec.ts` 转发 create 的 origin。`packages/client/ui-conversation/tests/skeleton.client.spec.tsx` 对空白 `origin: 'dshbot'` 会话跳过 EmptyHero。`packages/client/runtime/tests/workspaces-service.client.spec.ts` 拒绝复用空白 dshbot/subagent。`packages/client/ui-agent-preset/tests/components.client.spec.tsx` 在 `origin: 'dshbot'` 时隐藏顶栏预设标签。`packages/client/ui-conversation/tests/input-bar.client.spec.tsx` 在 `origin` 为 `dshbot` 或 `agentPreset` 为 `dshbot-room` 时不渲染 `conversation.input.model`，并在房间里藏 `+` / plan / ContextMeter / `$`。`packages/client/ui-conversation/tests/chat-view.client.spec.tsx` 在房间里跳过 `Deep diving...`、上下文注入和 turn-tail。`packages/client/ui-files/tests/path-trigger.client.spec.ts`、`packages/client/ui-subagent/tests/browser-plugin.client.spec.ts`、`packages/client/ui-commands/tests/service.client.spec.ts` 与 `packages/client/ui-skill/tests/browser-plugin.client.spec.ts` 在 `dshbot-room` 下不返回 `@` / `/` 候选。桌面 `src/main/dshbot-preset.test.js`、`src/main/dshbot-catalog.test.js` 与 `src/main/dshbot-avatar.test.js` 钉住 profile 复制、房间 preset 安装、目录辅助函数（`parseRoomNext`、`groupTranscript`、`nextRoomSpeakerId`、`speakerSeat`、`speakInstruction`、顺序 `llm/stream` 分片、`emptyRoster`、群成员人设、人设芯片、`stampRoomPresets` / `noteAgentPreset`）、头像 normalize/体积上限、气泡不回退到调度指令、占用 `conversation.chat.empty`，以及插件 host 注册 `ask_participant`。
