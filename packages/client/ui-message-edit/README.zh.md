# @deepseek-ai/dsh-client-ui-message-edit

[English](README.md) | 中文

“编辑并重新发送”插件（浏览器侧）：在最新一条用户消息的操作条上提供一个铅笔按钮。点击后在**该消息之前**创建子会话（子会话保留此前所有轮次，但不包含这条消息及它的旧回答），打开子会话并把原文本回填到输入框。原会话保持不变；子会话以血缘形式出现在侧栏，在其中发送即从修改后的提示词继续生成。

该控件作为 `conversation.chat.user-actions` 条带的 `edit` 条目（order 10）贡献。该条带由 `ui-conversation` 声明，渲染在用户消息的 IconActions 行内、复制按钮旁，因此继承该行的样式与 hover 行为。仅当被寻址的节点是转录中最新一条 `kind: 'user'` 节点时才渲染（历史用户消息不显示编辑控件）；会话仍在运行、消息包含非文本块（如图片）、或本次 fork 请求尚未结束时控件不可用。

fork/打开/回填事务封装在注入面中：`sessions.fork({ sessionId, beforeSeq, increaseTitle })`，随后 `sessions.open(childId)`，再通过子会话作用域的输入 facade `setDraft(text)` 回填。fork 失败时保持源会话选中，并在其 composer 上发布本地化的失败提示。

`/client` 导出插件本体（`apply`/`inject`）、`MessageEditAction` 组件以及注入面类型。

## 模型体验

无新增模型接触：该操作只是带 `beforeSeq` 切点的普通 `session.fork`，子会话继承源会话此前的历史，模型不会重复看到被编辑的消息。

#### KV 缓存影响

与普通分支相同：子会话从新的历史尾部开始，无额外影响。

## 已知限制与后续工作

- **仅纯文本消息**：包含图片或其他非文本块的消息暂不支持编辑；铅笔保持可见但禁用，并以 tooltip 说明原因。
- **运行中不可编辑**：当前回复未结束时控件禁用，不会打断正在运行的轮次。
- **仅聊天视图**：trajectory 与 waterfall 视图不渲染用户消息编辑控件。
