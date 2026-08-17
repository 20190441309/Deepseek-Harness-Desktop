# @deepseek-ai/dsh-client-ui-layout

[English](README.md) | 中文

外壳插件：四栏 AppFrame（拖动手柄与让步链）加 `ctx.layout` 面板几何服务；它注册到运行时拥有的 `root` slot，并声明 `sidebar`、`conversation`、`details`、`surfaces`、`shell.overlay`、`shell.titlebar.trailing` 和 `shell.terminalDrawer`。侧边栏的缩放边界是不可见命中条带，详情栏与 surfaces 栏边界则保留浮动胶囊；让步时先把 surfaces 压到下限，再压 details，再派生关闭 surfaces，再派生关闭 details。关闭的侧边栏仍保留 56px 控制栏；关闭的 details 与 surfaces 宽度为 0。竖屏且在 `PHONE_MAX`（768px）以下时，侧边栏与详情栏轨道归零：会话栏占满宽度，侧边栏变为覆盖抽屉，详情栏变为全屏覆盖层；此时不绘制拖动手柄。任何低于 1024px 的框架，以及任何 `[data-phone]` 框架，隐藏标题栏尾簇，避免 Session log、Git 和分栏开关盖住会话标题；slot 仍保持挂载。尾簇仍画在被挤窄的会话栏上时，AppFrame 发布 `--dshd-titlebar-conversation-reserve` 以及 `full` / `cozy` / `compact` 密度，让页头让位、标签收起（[标题栏拥挤](../../../.agents/notes/implemented/bug-fix/2026-08-17-titlebar-crowding-density.md)）。横屏把侧边栏留在网格里，不会自动收到 56px 轨道；横屏依据设备旋转（`screen.orientation.type`，该 type 过期或未触发 `orientation.change` 时再看物理 `screen.availWidth`/`availHeight`），而不是被键盘压矮的视口。该包还提供主题呈现器：它消费解析后的 `ctx.theme` 快照，并将其投影到 document（用 `html { color-scheme }` 驱动原生 UA 控件，依据当前配色方案设置 `body[data-ds-dark-theme]`，并将主题的别名 token 设为 body 上的内联变量，同时拥有一个 `<meta name="theme-color">`，其内容随计算后的 body 背景色更新）。在应用调色板和 token 后进行测量，可确保渲染后的背景成为唯一的颜色依据；呈现器在 dispose（资源释放）时会移除其自有的元数据节点，并一并清除其写入的其他全局状态。

AppFrame 始终挂载会话栏、详情栏、surfaces 栏以及仅位于会话栏下方的终端抽屉；已连接 Session 通过 `SessionProvider` 渲染。布局 store 侧边栏以默认宽度启动，详情栏保持关闭。surfaces 宽度和终端抽屉高度把上次打开的尺寸（以及当时是否打开）写进 `localStorage` 键 `dshd.layout.panels`；侧边栏和详情栏仍是会话瞬时状态。hero 和其他未选中状态也会将详情栏的渲染宽度派生为零，但不会改变存储的宽度偏好。AppFrame 会跨越这些状态保留最后一个非 blank 会话 id：首个会话保持关闭；显式打开详情栏的操作会使用约定默认宽度；返回同一会话时恢复其未改变的宽度；选择不同会话时，详情栏会在绘制前关闭。标题栏开关只写入 surfaces 栏和终端抽屉，不会打开或关闭详情栏。AppFrame 的第一网格行是共享标题栏带：会话栏页头通过 subgrid 决定该行高度，该带只覆盖详情栏，surfaces 跨越所有行直到窗口顶部。surfaces 打开时，尾簇只占第 2–3 列，因此不会盖住右侧栏；窗口控件通过 surfaces 标签栏上的 `--dshd-wco-controls` 避让。surfaces 关闭时，尾簇伸到右缘，相对窗口控件做 inset。尾簇为 `-webkit-app-region: no-drag`。会话栏 caption 行拥有 drag；Electron 注入脚本只绘制窗口控件板。详情栏从下方的主体行开始，因此分割线不会穿过 Session log、Git 或窗口控件。会话 owner share 为空，侧边栏 owner share 只包含 `collapsed` 和 `width`；注册方通过标准钩子获取业务数据，并从各自的 inject 接口获取操作。

`/client` 导出表层包含插件主体（`apply`／`inject`）、`LayoutController` 和各个 owner-share 接口。AppFrame、面板 store 与让步求解器仍属于包内部。

## 模型体验

无。布局外壳管理浏览器查看状态；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **侧边栏和详情栏仍是会话瞬时状态**：重新加载会恢复侧边栏默认值并使详情栏保持关闭；在不同会话 id 之间切换同样会关闭详情栏，并忘记拖动后的宽度，而未选中表面会以零宽度渲染详情栏，但不会修改几何信息。surfaces 宽度和终端抽屉会记住上次打开的尺寸。
- **让步链自动关闭通过推导零宽度实现，不会改动宽度偏好**：窗口变宽时面板会自行恢复；消费方禁止把 store 中的详情宽度当作实际渲染状态。
- **挤压重排期间不提供滚动锚定**：布局变化可能移动读者的 viewport。
