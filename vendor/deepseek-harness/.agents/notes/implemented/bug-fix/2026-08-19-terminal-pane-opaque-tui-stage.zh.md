# Agent Note: 终端窗格是不透明的画布井

Status: implemented

[English](2026-08-19-terminal-pane-opaque-tui-stage.md) | 中文

## 问题

CodeBuddy 斜杠菜单用 Ink 的 `bold` 加 `colors.info` 标记选中行，且 `showIndicator: false`——没有反色、没有单元格背景、没有 `>` 前缀。桌面窗格把这些字形放在 alpha-0 的 xterm 填充上，下面是 12% 壁纸结霜，info 对 secondary 被冲掉，选中态无法分辨。客户端 overlay 用正则和本地方向键索引猜行，会把条画错。`minimumContrastRatio` 对着 alpha-0 画布 RGB 只能让字能读，造不出选中行。

## 决策

PTY 井是不透明的。设计表上 `--dsw-alias-terminal-pane` 为 `var(--dsw-alias-bg-base)`；`mixWallpaperSurfaces` 把它保持为不透明的画布回退（浅色 `--dsw-static-neutral-bluish-00`，深色 `--dsw-static-neutral-bluish-950`）或家族的实心 `--dsw-alias-bg-base`，从不对 transparent 做 `color-mix`。`.paneTerminal` 铺该 token，没有 `backdrop-filter`。`readXtermTheme` 把 `theme.background` 设为无 alpha 的画布 RGB。`TerminalPane` 以 `allowTransparency: false` 构造 xterm，避免半透明填充被换成 `#000000`。壁纸仍混合会话画布和侧栏；终端井不参与。窗格仍不重涂 `.xterm-bold`，也不画猜出来的选中条。反色单元格保留 `.xterm-bg-257`／`.xterm-fg-257` token 覆盖。`minimumContrastRatio` 为 1；ANSI 青／蓝为 Pierre，见 [PTY 的 ANSI 颜色跟随 T3code Pierre，而不是 UI 状态 token](2026-08-19-terminal-ansi-pierre-palette.md)。

## 曾考虑的替代方案

**保留壁纸玻璃，在猜出的行上铺自适应 hover 洗色。** 否决：洗色可控，行不可控；本地方向键索引会与 TUI 脱同步，SGR 刮取还会误伤普通输出。

**加厚 12% 结霜直到粗体加 info 可读。** 否决：字形背后仍是半透明照片，并且为修一个菜单在全局出卖壁纸。

**单元格继续 alpha-0，只靠 `minimumContrastRatio`。** 否决：对着画布 RGB 提对比并不能在 TUI 从未画背景时重建选中行。

**窗格铺 `--dsw-alias-bg-layer-2`。** 否决：layer-2 是抬起对话框标记；井跟随画布家族，而不是叠一层对话框。

## 后果

壁纸不再透过会话列底栏抽屉或右边栏 Terminal occupant。CodeBuddy 原生的粗体加 info 高亮落在浅色主题的浅井、深色主题的深井上，选中态就是 TUI 自己的 SGR。会话、侧栏和抬起铬仍走玻璃滑杆。反色单元格仍是 info-fill 覆盖，而不是互换后的默认背景。

## 测试

`readXtermTheme` 钉住由 `--dsw-alias-bg-base` 得到的不透明 `rgb(...)` `theme.background`（含 `color-mix` 与 `color(srgb …)` 标记）。抽屉套件钉住 `allowTransparency: false`，以及 `.paneTerminal` 背景 `--dsw-alias-terminal-pane` 且无 `backdrop-filter`。`mixWallpaperSurfaces` 钉住浅色井为 `var(--dsw-static-neutral-bluish-00)`，自定义 hex 画布为该 hex。`theme.client.spec.ts` 钉住壁纸混合后的这些不透明窗格值。`wallpaper.css` 不含 `--dsw-terminal-pane-blur`。

## 相关

[终端画布使用应用背景](2026-08-18-terminal-canvas-app-background.md) 拥有透明工作区根、壁纸压暗，以及嵌套铬不在会话画布上重涂 `--dsw-alias-bg-base` 的规则。[终端窗格以最小对比度如实渲染 TUI](2026-08-19-terminal-verbatim-tui-contrast-and-follow.md) 拥有已删除的行画笔与反色单元格 CSS。[PTY 的 ANSI 颜色跟随 T3code Pierre，而不是 UI 状态 token](2026-08-19-terminal-ansi-pierre-palette.md) 拥有 ANSI 1–15 与 `minimumContrastRatio`。
