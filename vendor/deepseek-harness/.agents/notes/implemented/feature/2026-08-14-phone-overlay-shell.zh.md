# Agent Note: Phone overlay shell for the official web UI

Status: implemented

[English](2026-08-14-phone-overlay-shell.md) | 中文

## Problem

官方 web 外壳把 1024px 以下一律当成被挤窄的桌面：侧边栏收成 56px 轨道，让步链仍为该轨道和 640px 中间栏下限留位。手机宽度的浏览器或 Android WebView 因此会在被压扁的会话栏上叠一条轨道，没有安全区留白，也无法在不挡住输入栏的情况下找回完整会话列表。手机远程客户端套的就是这一页，所以缺陷是桌面窄窗布局，而不是缺少原生聊天界面。

## Decision

`AppFrame` 在 `PHONE_MAX`（768px）以下增加更严的一档。该档仍使用现有的窄窗 store 开关（`narrowExpanded` / `toggleSidebar`），因此 1024px 的平板自动折叠保持不变。手机上网格轨道为 `0px minmax(0, 1fr) 0px`：会话栏占满框架，侧边栏画成左侧覆盖抽屉（`PHONE_DRAWER`，320px，夹紧后右侧留出点击遮罩），已打开的详情栏偏好则画成全框覆盖层。不挂载拖动手柄。AppFrame 上的浮动菜单按钮打开抽屉；点击遮罩关闭。侧边栏 owner share 仍只携带 `collapsed` 和 `width`；关闭的手机抽屉报告 `width: 0`，因为没有轨道。会话栏标题、输入栏、详情栏标题和设置面板增加 `max-width: 767px` 的安全区与全幅规则。`apps/web/index.html` 设置 `viewport-fit=cover`。

## Alternatives considered

**重做一套原生 Android / Expo 聊天界面。** 否决：产品包装的是官方页；第二套会话栈会立刻和工具、审批、主题分叉。

**把手机当成现有的 1024px 轨道。** 否决：390px 框架上的 56px 轨道会让会话栏不可用，并且仍然藏起会话标题。

**把侧边栏 slot 契约加宽，加入 `toggleSidebar` / `phone`。** 否决：手机铬栏是外壳职责；AppFrame 已经拥有折叠。会话栏和侧边栏插件不需要新的 owner 字段来恢复抽屉。

**把 `dsh web` 绑到 `0.0.0.0` 供手机访问。** 否决：Host 围栏和缺失鉴权使未认证的局域网绑定不安全。桌面反向代理让 dsh 继续只听回环地址。

## Consequences

手机和平板现在是同一窄窗 store 里的两档：测试必须把 390px（覆盖层，无手柄）和 980px（轨道）分开钉住。覆盖层 CSS 住在 ui-layout；会话栏和设置只加媒体查询内边距，因此之后改抽屉不必重触 slot 契约。代价是第二个断点，作者不得把它折回 `SIDEBAR_AUTO_COLLAPSE`。
