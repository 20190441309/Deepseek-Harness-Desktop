# dshbot：侧栏 Bot 列表与群聊

桌面启动时把插件 `dshbot` 装进 web profile（和 `dshmarket` 一样）。官方侧栏只多一个 Tab 插槽；不装插件时侧栏与现在一致。视觉语言仍是 `ui-primitives` + `--dsw-alias-*`，编辑走居中 `Modal`，不占用右侧 Files/Browser。

## 决定

1. **每个 Bot 是持久联系人。** 目录在 settings 命名空间 `dshbot`。点列表项 `sessions.open` 打开已有对话。会话打 `origin: 'dshbot'`，工作区浏览器的 `sessionVisible` 把它们藏起来。
2. **群聊是 WhatsApp 群，不是带父对话的调度室。** 只从侧栏「机器人」加号创建，至少选两个成员。房间会话用 preset `dshbot-room`（写入 `$DSH_HOME/.agent-presets/dshbot-room`，不出现在会话的 agent preset 选择器里；composer 也不渲染 `conversation.input.model`）。可见气泡只有用户和成员：房间 session 只做日志、取消、以及 one-shot child 的技术父级，从不调用聊天模型。选人用代码，对齐 [agentschat](https://github.com/nvganta/agentschat) 与 [agents-team](https://github.com/pedros-team/agents-team) 的共享 transcript：默认按成员顺序全员轮询（后者能看到前者已落盘的话）；用户 `@名字` 则只叫被点名的。后到座位默认沉默：`ask_participant` 的子会话 user 消息是 `[名字]` 群日志再加一段座位 `speakInstruction`（first 回答用户；later 列出本轮已有正文，默认整段只能是 `NEXT: pass`，只有人设能提供日志里没有的纠正、反对或一个新点时才开口）。空 `description` 的 later 座位写明没有独特信息、应当 pass。编辑资料用芯片填互不重叠的中文人设（反对 / 补全 / 落地 / 毒舌），不是商店。成员回复最后一行是调度脚注 `NEXT: pass` / `NEXT: done` / `NEXT: all` / `NEXT: @甲 @乙`（缺行等于 `pass`）；代码从 session 事件重放队列，首轮名单说完后才接受 `all` 或点名，`done` 立即停，次数和轮次上限是插件 `Config` 的 `maxSpeaks`（默认 12）与 `maxRounds`（默认 4）。人设不把 `NEXT: all` 写成首轮默认。气泡和 `groupTranscript` 剥掉该脚注，只调度、没有可见正文的 `pass` 不画气泡。不要用 AutoGen `GroupChatManager` 再雇一个 LLM 当群主。`llm/stream` 每步只产出一个 `ask_participant`，队列空了就 empty stop。`ask_participant` 用 `subagents.start` 按该成员的模型和人设跑一轮并 `await result`，不使用 continuable followup。`ask_participant` 由插件全局注册；`dshbot-room` preset 只 `tools.restrict` 到该工具。非房间调用执行失败。v1 不在空回车后让成员自己聊一轮。会话里选「群聊」预设不是建群。空白 `origin: 'dshbot'` 会话不是新对话草稿：跳过 EmptyHero（「探索未至之境」、工作区芯片、`dshbot-room` 花粒），顶栏显示群名，transcript 空态画成员头像/名字，底部是普通 composer。房间 transcript 不画「上下文注入」、`Deep diving...`、turn-tail；composer 不画 `+`、plan、ContextMeter、`$` 技能菜单。插件把 `dshbot-room` 打到目录房间的会话列表行上，以免 host 汇总漏掉 preset 时仍露出这些铬。输入 `@` 只出成员（`inputTriggers` source `dshbot`），房间里文件/子智能体/cordis/`/` 候选为空。侧栏一行名字、一行模型（空则「使用部署默认」）；群聊无第二行，头像角标「群」。New Session 的空白复用不吃 `origin: 'dshbot'` 或 `'subagent'`。
3. **Bot 私有模型不改全局默认。** 只在编辑资料里选模型；保存和打开联系人时 `session.selectModel({ persistDefault: false })`。composer 不渲染 `conversation.input.model`。
4. **人设按会话注入。** Host `systemPrompt` section 仅当组装中的 session 在目录里且不是房间时写入 `description`。
5. **已有 `turn/start` 的会话不能改 cwd。** 空白会话可以在编辑里换工作区并重建绑定。
6. **头像在编辑弹层里选。** 目录项带 `avatar`：八种机器人形状加关闭色板，或上传后裁成圆/方的小 JPEG。没有记录时按 id/名字哈希落到一种形体。侧栏在 `session.running` 时、群聊气泡在工具还没有 result 时，形体像软泥一样连续压扁、鼓边、拉长并侧倾，眼睛转动并眨眼。编辑弹层表单可滚动。不做 Generate。

## 官方钩子

- `ui-sidebar`：`sidebar.nav.tab`（list）+ `sidebar.page`（keyed）。零贡献不画 Tab。插件 Tab 下隐藏 New Session。
- `SessionHeader.origin`：`'subagent' | 'dshbot'`。`session.create` 只接受 `origin: 'dshbot'`。空白 `origin: 'dshbot'` 会话跳过新对话 Hero；`connectWorkspace` / `connectNoDirectory` 不复用它们。
- `conversation.chat.empty`：ChatView 在无 Node 时渲染的可选 list；dshbot 填成员头像空态。
- `conversation.input.model`：InputBar 在 `origin === 'dshbot'`（一对一与群聊）或 `agentPreset === 'dshbot-room'` 时不渲染该座位。模型只在机器人编辑资料里改。房间再藏 `+`、plan、ContextMeter、`$`；`@` 菜单只留 dshbot 成员。
- `selectModel.persistDefault` 默认 `true`。

## 非目标

- 把 Bot 设置塞进右侧 surfaces。
- 改 `agent-loop` 或让多个模型写同一条 agent-loop。
- 头像商店、分区、未读、置顶。编辑资料里的头像选择不是商店。
- 普通 `dsh web` 自动带此插件。
- 做成 `packages/client` 官方包。
