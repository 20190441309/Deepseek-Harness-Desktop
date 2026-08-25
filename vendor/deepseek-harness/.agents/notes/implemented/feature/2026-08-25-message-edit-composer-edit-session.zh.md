# Agent Note: 消息编辑改乘常驻 composer——composer 编辑会话取代气泡 textarea

Status: implemented

[English](2026-08-25-message-edit-composer-edit-session.md) | 中文

## 问题

[就地编辑器](2026-08-15-inline-user-message-edit.zh.md)及其[生产打磨](2026-08-25-message-edit-production-polish.zh.md)在用户气泡里放的是一个普通 textarea。产品负责人裁定这个方向错了：编辑面必须是**与底部输入框完全相同的全功能输入**——带引用装饰的草稿状态机、图片附件、斜杠／提及词表、composer 的 Enter/Shift+Enter/IME 策略、走 composer 自有通道的提示、以及尺寸调整能力——而不是一个只是长得像的简化编辑器。

真正的 composer 无法直接在气泡里再挂载一份。`InputBar` 是 `conversation.composer.bar` 的占位者，经标准 provide 通道由会话唯一的输入状态机供给，还带一个绑定在该条目上的 hooks 隔间（提示、词表、beam、resize）。气泡里的副本需要第二台状态机和第二个隔间，而 `ui-message-edit` 以值导入 `InputBar` 恰是客户端 bundle 纯净门禁明令禁止的跨插件导入。

## 决策

让常驻 composer 自己成为编辑面：在输入 facade 上开出一等的**编辑会话**。仍然成立的前提：铅笔只出现在最新已定稿用户消息上且不 fork；确认执行 `sessions.fork({ beforeSeq, increaseTitle: true })` → 打开子会话 → 提交；源日志永不改写。

**输入契约长出编辑会话。** `InputEditState`（`key`、`label`）以 `InputState.edit` 发布；`InputEditSpec` 另带草稿 `seed` 与改道的 `submit` 汇。`SessionInput.beginEdit(spec)` 收起操作者敲到一半的草稿和已附图片、播种消息原文并发布状态；`cancelEdit()`（`ComposerKeyboard` 上同名）恢复收起的内容。编辑会话存续期间，`submit()` 改道到 spec 的汇而不是默认发送；斜杠裁决被跳过（修订就是一条普通消息，即便以 `/` 开头）；命令认领被拒绝；持久化草稿镜像被抑制，播种文本不会覆盖操作者存档的草稿。汇成功则结束会话并恢复收起内容；返回错误则编辑带着草稿继续待命，原因走 composer 自己的提示通道播报。

**InputBar 呈现该会话。** 卡片上一条横幅行标出编辑（`edit.label`）并带取消按钮；进入会话时输入框聚焦、光标在末尾；Escape 以与 Enter 相同的 IME 组合守卫取消编辑，状态机提交中则拒绝。

**气泡占位者改为编辑态标记。** `MessageEditEditor` 挂载即启动会话（`beginEdit(seq, joinedText)`），以变暗样式渲染原文并给出「正在下方重新编辑」提示与就地取消；composer 侧一旦结束会话即恢复静态气泡。其注入面收窄为 `beginEdit`/`endEdit`；fork—打开—交接事务移入 spec 的汇，在确认时刻复查「最新且空闲」，并把修订文本**连同图片**交给子会话的输入面。

**焦点有方向。** composer 侧的取消（横幅、Escape）让焦点留在 composer；气泡的取消经由既有共享 store 握手把焦点交还重新挂载的铅笔。

## 曾考虑的替代方案

**把真 composer 挂进 `user-editor` 座位**（编辑期间把 `conversation.composer.bar` 条目移过去或再注册一份）。否决：bar 条目的 hooks 隔间和状态机接线绑定在 composer 链的渲染位上；第二个活挂载要么把一台状态机劈到两个 DOM 家，要么复制它，而 sticky-composer 滚动口拥有该座位的几何。就地晋升保住一台机、一处挂载，奇偶校验由构造保证。

**抽出共享的 composer 主体包。** 否决：为一个消费者把 ui-conversation 私有骨架的一半搬进共享面，而奇偶校验仍需复制状态机与隔间接线——那才是 composer 全功能的来源。

**继续打磨气泡 textarea 逼近奇偶校验。** 产品负责人否决：明令禁止只是长得像的第二个简化编辑器。

**编辑期间用 `conversation.blocks` 禁用 composer。** 仍然否决（每会话仅一个阻断，会覆盖既有原因）。

## 后果

奇偶校验是彻底的，因为编辑面**就是** composer：附件、装饰、词表、排队／转向策略、提示与无障碍全部随行，现在如此，composer 继续生长时也如此。气泡不再拥有任何编辑底盘（没有 textarea、没有 ResizeObserver 重排、没有 `editor.field` 文案）。代价：输入契约多了三个动词和一个状态字段；侧栏仍只在确认时生长（铅笔从不 fork）；取消的焦点语义按表面分流——composer 侧取消留在 composer，气泡取消交还铅笔——web e2e 钉住这一点。facade 规格钉住收起／播种／恢复、汇改道、失败待命、裁决跳过、认领拒绝与镜像抑制；InputBar 规格钉住横幅、Escape 与忙碌锁；插件规格钉住确认守卫与图片交接。
