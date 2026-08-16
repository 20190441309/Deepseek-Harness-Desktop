# @deepseek-ai/dsh-client-ui-theme

[English](README.md) | 中文

主题插件：基于 --dsw-* token 基础样式表（静态尺度 + 别名语义层）的 ThemeRuntime。该服务拥有实时色制偏好（`light`／`dark`／`system`）、浅／深两半主题家族、推导出的 `--dsw-alias-*` token、玻璃透明度、可选背景图（毛玻璃 + 像素化）与字体附加项。它将 `system` 通过 `prefers-color-scheme` 解析为实际半，再选取该半的家族，并发布不可变的 `ThemeSnapshot`，通过 `theme/change` 事件通知变化；它绝不接触 DOM：ui-layout 的呈现器会应用解析后的快照（`html { color-scheme }`、`body[data-ds-dark-theme]`，以及主题的别名 token 内联变量）。DeepSeek 家族的推导 token 为空，因此 CSS 表仍是产品默认色板。其他家族把画布留在种子背景色上，并把强调色铺到发送按钮、链接、用户气泡、侧栏选中项和主按钮，这样自定义颜色会出现在对话铬架上，而不是只出现在外观页的控件里。来自回环地址的浏览器会先以 `system` 与 DeepSeek 两半立即提供该服务，随后在后台加载 `ui-theme` 分节，并将每个产品字段通过 Host settings API 写入；其本地提供方默认将设置存入 `$DSH_HOME/settings.yaml`。收到推送的 settings 变更时或重连后，浏览器都会重新拉取该设置；连续快速选择会按操作顺序携带 namespace revision 串行写入，最新写入被拒时则重新加载持久化值。远程浏览器无法访问特权 settings API，因此它的选择仅保留在进程内。进程内 `register()` 的主题 id 仍是扩展，不会跨越内置 settings schema；用户创建的家族持久化在 `customThemes` 中。该持久化边界由[Host settings 支撑的偏好决策](../../../.agents/notes/implemented/bug-fix/2026-08-06-host-backed-web-preferences.md)拥有。连续控件（滑杆、字体输入）的持久化写入按字段合并并防抖 300 毫秒，本地快照立即发布；有写入排队或在途时不采纳 Host 回声，因此拖动流畅且不会回跳。外观页是独立的 `settings.section`（`id: appearance`，order 5）。主题编辑器的每次改动都通过 `setPreviewFamily` 实时预览——以一个临时家族覆盖当前激活半区，完全不触碰 settings 作用域；关闭编辑器（保存、取消或卸载）即恢复已存储的选择。由于屏幕上只有与当前解析色制相符的半区可见，编辑器会说明当前正在绘制哪个半区，主题卡片也会给该半区标注“当前模式”徽标。背景图 data URL 是可选项；设好之后才出现毛玻璃和像素化滑杆。像素化把图绘制到 `视口 / 系数` 大小的 canvas 位图，再由 CSS `image-rendering: pixelated` 拉伸放大；设有背景图时，玻璃透明度分层驱动铬架实心度：主画布最通透（填充不超过 45%，因此玻璃 100% 时对话里图仍能透出）、侧栏取未帽定画布曲线与玻璃的中值因而玻璃 100% 时轨完全不透明、浮起表层保持完整数值。对话列、详情列和工作台列的根不再重涂该画布填充；侧栏列与 SidebarRoot 都在框画布上再涂 `--dsw-specific-sidebar-fill`，所以轨比对话更厚。启动脚本不嵌入整张图。

当主机组合包含 HTTP 服务器时，主机侧紧接 `<body>` 起始标签注入同步引导代码。每份 index 响应会嵌入当前色制、已经推导好的两半 token 字典、界面字号和玻璃透明度；浏览器只按操作系统配色解析 `system`，随后在外壳加载页面渲染前设置 `color-scheme`、`body[data-ds-dark-theme]` 以及当前半的内联 token。不含 HTTP 服务器的组合不受影响，插件树激活后，ThemeRuntime 与 ui-layout 仍分别是客户端状态和后续 DOM 更新的权威来源。

`src/styles/` 下有七张样式表，全部由 web 壳的 `base.css` 导入：`base.css`、`motion.css`、`design-platform.css`、`wallpaper.css`、`scrollbar.css`、`gradient-shadow-text.css` 与 `shiki.css`。`motion.css` 是共享的 overlay／popover／fade／swap／flip recipe 表，必须排在声明时长和缓动 token 的 `base.css` 之后。`scrollbar.css` 是 `--dsw-alias-scrollbar-*` token 的唯一消费方，必须排在声明这些 token 的 `design-platform.css` 之后。`wallpaper.css` 负责固定背景图层，并清掉 html／body／`#root` 的实底，好让混合后的铬架 token 透出底图。

滚动条重新绑定约定：`scrollbar.css` 在 `body` 上把 `--dsh-scrollbar-thumb` 与 `--dsh-scrollbar-thumb-hover` 绑定到 l1（基础表面）token，两条渲染路径都读取这一组变量。高层级表面（菜单、浮层、对话框）在自己的容器上设置 `--dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2)` 与 `--dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2)`；一次重新绑定即可为引擎实际走的那条路径换色。这组变量的另一个合法目标是 `transparent`，即完全不绘制滑块——[ui-sidebar](../ui-sidebar/README.md) 在指针不在栏内时就这样重新绑定自己的列。绑回 l1 那组不算重新绑定，它只是重述基础表面的默认值。`--dsh-scrollbar-width` 镜像 WebKit 滚动条的布局宽度，供需要与占布局宽度的滚动条对齐的表面使用——[ui-conversation](../ui-conversation/README.md) 用它作为覆盖 composer 座位 `right` 偏移——scrollbar-styles 规格把它与镜像规则及消费者配对检查。

两条路径在构造上互斥。`scrollbar-width`／`scrollbar-color` 写在 `@supports not selector(::-webkit-scrollbar)` 之内，因为这两个属性中的任一个只要取非 `auto` 值，Chromium 与 Safari 就会丢弃该元素上的全部 `::-webkit-scrollbar*` 规则，`::-webkit-scrollbar-thumb:hover` 也在其中——若无条件地同时声明，`--dsh-scrollbar-thumb-hover` 在任何引擎上都不会被渲染。因此 Firefox 走标准属性，WebKit 系引擎走伪元素，hover token 只经由伪元素这条路径渲染。相关原理与实测计算值见[滚动条 Agent Note](../../../.agents/notes/implemented/bug-fix/2026-07-28-themed-scrollbars-and-reserved-gutter.md)。

## 模型体验

无。主题服务管理浏览器偏好；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **第三方 `register()` 主题是表层，不是产品**：注册主题意味着覆盖同名别名变量；目前不会验证一组覆盖是否完整。用户创建的家族改走 `customThemes` 持久化。
- **VS Code 主题导入仍暂缓**：JSON ThemeFamily 导入／导出已交付；转换 VS Code 主题文档尚未做。
- **token 样式表是颜色值的唯一权威来源**：会有意不补入 cssdesign 中缺失的值（例如设计中的 #4176E6 标签页蓝色）；一律采用最接近的语义 token。设计负责人批准的新增值是例外：须在同一变更中以一个静态尺度层级与一个语义别名的形式进入（`--dsw-static-blue-900` / `--dsw-alias-label-primary-bluish`）。
