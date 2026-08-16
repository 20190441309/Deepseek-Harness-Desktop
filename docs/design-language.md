# DeepSeek Harness Web UI 设计语言

中文 · [English](design-language.en.md)

本产品的视觉语言就是官方 `dsh web`。桌面壳、启动页、关闭遮罩、标题栏注入、右边栏、手机远程打开的官方页、以及任何新增前端，都必须看起来像同一套界面，不得另起一套皮肤。

改 UI / 布局 / 前端之前先读本文。工程落地细则（CSS Modules、token 分层、动效 recipe）以官方文档为准，本文不重复那份清单：

- Token 源码：[design-platform.css](../vendor/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css)、[base.css](../vendor/deepseek-harness/packages/client/ui-theme/src/styles/base.css)、[gradient-shadow-text.css](../vendor/deepseek-harness/packages/client/ui-theme/src/styles/gradient-shadow-text.css)、[motion.css](../vendor/deepseek-harness/packages/client/ui-theme/src/styles/motion.css)
- 控件原语：`vendor/deepseek-harness/packages/client/ui-primitives/`（`Button` / `Input` / `Menu` / `Modal` / `Tooltip` / 图标）
- 工程规则：[web-styling.md](../vendor/deepseek-harness/docs/web-styling.md)

## 适用范围

凡改动可见界面，都受约束，包括但不限于：

- `vendor/deepseek-harness/packages/client/**`、`apps/web/**`
- `src/renderer/**`、`src/main/closing-overlay.js`、`src/main/harness-chrome-inject.js`

终端、diff、代码块按官方约定保留等宽、不换行；那是内容排版，不是另做一套 chrome。

## 强制规则

1. **先复用，再绘制。** 按钮、输入、菜单、对话框、Tooltip、开关行，用 `ui-primitives`。不要再造一套圆角、高度、hover。
2. **颜色只走 `--dsw-alias-*` / `--dsw-specific-*`。** 功能 CSS 禁止写 `#hex`、`rgb()`、独立 `--bg` / `--accent`。缺 token 先加主题表，再引用语义别名。
3. **明暗只发生在主题表。** 功能 CSS 不得写 `[data-theme]`、`[data-ds-dark-theme]`、`prefers-color-scheme` 分支。
4. **主色不是电光蓝。** 默认主按钮是近黑（浅色）/ 近白（深色）：`--dsw-alias-button-primary-fill`。品牌蓝是 `--dsw-static-deepseek-500`（`rgb(65, 118, 230)`）及其 alias（`--dsw-alias-button-info-fill`、`--dsw-alias-state-business-primary`），用于信息强调、用户气泡、选中态。禁止 `#2b5cff`、`#6ea8ff`、`#3964fe` 这类平行色板。
5. **描边用透明度，不用实心灰。** 浅色 `rgba(0,0,0,.04/.10/.12)`，深色 `rgba(255,255,255,.06/.12/.16)`，对应 `--dsw-alias-border-l1`～`l3`。栏与栏之间是 1px 发丝线，不是投影卡片墙。
6. **Hover / Active 用交互 token。** 浅色 `rgba(38, 49, 72, .06 / .10)`，深色 `rgba(255,255,255,.08 / .14)`：`--dsw-alias-interactive-bg-hover` / `active`。不要新造一层实心灰底。
7. **圆角按角色。** 主按钮胶囊 18（高 36）/ 小按钮 14（高 28）；输入 8；菜单 12；对话框 24；Tooltip 8；图标点击区 8。不要 6px 方钮；999px 只给胶囊按钮和开关。
8. **字号必须配行高。** 标题 16/24，正文 14/22，紧凑 12/18，Tooltip 13/20。字重 400 / 500 / 600 / 700；Figma 510 渲染为 500。禁止 `font-weight: 650`。
9. **间距是 4 的倍数。** 控件内边距、gap、栏间距用 4 / 8 / 12 / 14 / 16 / 20 / 24。
10. **图标 16px、`currentColor`。** 用 `ui-primitives` 的 `ic_ds_*`。密集标题栏可用 14px。不要引入另一套图标库或彩色填充图标。
11. **动效只动 opacity 和 transform。** 时长走 `--ds-transition-duration*`（100–200ms，flip 400ms）。新对话框 / 菜单用 `usePresence` + `motion.css` recipe。禁止动画 `backdrop-filter` 和大面板宽高，禁止引入动画库。
12. **阴影只用 lv1 / lv2 / lv3。** 菜单和对话框用 `lv3`；输入条、悬浮卡片用 `lv2`。禁止 `0 18px 40px` 这类重阴影。
13. **毛玻璃止于官方配方。** 遮罩 `blur(2px)` + `--dsw-alias-bg-mask-*`；抬起面用 `color-mix(..., var(--dsw-alias-glass-opacity), transparent)`。不要加更重的 blur，也不要每层都铺投影。
14. **滚动条用共享样式。** 禁止组件内 `::-webkit-scrollbar`。
15. **产品文案中文，代码注释英文。** 不要把 VS Code / Material / iOS / T3code 的密度和装饰搬进来压过官方页。

## 视觉锚点

对照官方页自检：侧栏浅灰蓝底、会话区干净画布、用户气泡淡蓝、发丝分隔、胶囊主按钮、16px 线框图标、菜单 12 圆角 + 轻阴影。新块放进这一页时，不应一眼能看出是「另一套产品」。

| 角色 | Token / 几何 |
| --- | --- |
| 画布 | `--dsw-alias-bg-base` |
| 侧栏 | `--dsw-specific-sidebar-fill` |
| 抬起层 | `--dsw-alias-bg-layer-1`～`3` |
| 主文字 / 次文字 / 说明 | `--dsw-alias-label-primary` / `secondary` / `tertiary` |
| 用户气泡 | `--dsw-specific-bubble` |
| 选中行 | `--dsw-specific-sidebar-nav-item-active`（强调用 `*-accent`） |
| 字体栈 | `--dsw-font-family`（系统 UI + 苹方 / 雅黑）；代码 `--ds-font-family-code` |

布局：`AppFrame` 是栏，不是卡片网格。关着的栏宽度为 0 且不画分隔线。标题栏尾簇是 28×28 图标按钮，给窗口控件留出实测避让，不要自绘一套窗口皮肤。

## 允许的例外

- **xterm / diff / 代码**：等宽、ANSI、字符网格，不套胶囊按钮。
- **原生窗口控件**：最小化 / 最大化 / 关闭保持系统命中区；颜色仍跟随当前主题 token。
- **无法 import 主题包的壳层**（boot 页、远程配对页）：必须复用同一套语义色和几何，或直接引用 `ui-theme` 样式表。禁止再开 `--bg` / `--accent` 平行色板。

## 现有偏差（不要再扩散）

启动页和远程登录页已收敛到官方 token。插件市场页 `src/renderer/marketplace/marketplace.css` 仍使用平行色板，**新代码不得抄它的 hex**；改到它时同样往官方 token 收。

## 自检

提交 UI 改动前：

- [ ] 有现成原语却手写了按钮 / 菜单 / 对话框？
- [ ] 功能 CSS 里出现了颜色字面量或第二套 CSS 变量？
- [ ] 圆角、高度、字号行高不在上表？
- [ ] 深色模式写在了组件里？
- [ ] 新弹层没用 `usePresence` / 官方 recipe？
- [ ] 看起来像另一款 IDE 或手机皮肤，而不像 `dsh web`？
