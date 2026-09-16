# Feature: Button metallic-paint hover

| Field | Value |
| --- | --- |
| **id** | `metallic-paint` |
| **status** | `active` |
| **last verified** | 2026-09-13 — ui-theme client-styles spec + 源码审查 |

## User paths

1. 主 Web UI 内任意原生 `button` 悬停：原有 hover 效果保留，其上叠加半透明银灰金属光泽，4.5s ease-in-out 往返扫过（「原本效果 + 金属漆」叠加而非替换）。
2. `:disabled` 与 `aria-disabled='true'` 按钮、未悬停按钮无扫光；`prefers-reduced-motion` 下动画停止、悬停时保留静态光泽。

## Invariants

- 覆盖范围止于主 Web UI document 内原生 `button` 元素；`role='button'` 行（DisclosureRow / ToolRow / 命令卡）、`<select>` / `<input>`、boot 页、启动器、壁纸图库窗、mobile/web 不扫。
- 扫光是按钮自身 `background-image` 叠加层：随控件 `border-radius`（含全局 corner-shape）自然裁切；不改 `position` / `overflow`，不占 `::before` / `::after`，不替换变体 hover 填充（`--dsw-alias-button-*` / `interactive-bg-*` 仍在下层生效）。
- 颜色只经 `color-mix` 取 label alias token 透明度：亮带 `--dsw-alias-label-primary-foreground`（与填充天然对比、保住白色字形如发送箭头）、暗带 `--dsw-alias-label-primary`、过渡带 `--dsw-alias-label-secondary`；不写颜色字面量、不写明暗主题分支，随主题反转并随自定义主题染色。
- 4.5s 周期是设计值不进 token 表（登记于 motion.md 指示器家族）；reduced-motion 只停 `animation`，不移除图像层。
- 全局样式只经 `installThemeStyles` 的 `metallic-paint.css` 注入，随 ui-theme 插件生命周期挂载/卸载；spec 断言挂载顺序。

## Allowed touch

- `vendor/deepseek-harness/packages/client/ui-theme/src/styles/metallic-paint.css`
- `vendor/deepseek-harness/packages/client/ui-theme/src/client/styles.ts`（注册与挂载顺序注释）
- `vendor/deepseek-harness/packages/client/ui-theme/tests/client-styles.client.spec.ts`、`packages/client/ui-theme/README.md`
- 本卡、[.cursor/rules/metallic-paint-product.mdc](../../.cursor/rules/metallic-paint-product.mdc)、design-language / motion 对应段落

## Do not touch

- 各变体 hover token、Button 原语几何与 `:active` 行为
- 为扫光新增设置开关、主题明暗分支、第二套图标按钮 skin、动画库或 WebGL（React Bits 原版 shader 不移植）
- `role='button'` 行/卡片、桌面壳其他窗（boot / launcher / 图库）与 mobile/web——扩面需用户确认

## Gates

| Kind | What |
| --- | --- |
| Automated | `packages/client/ui-theme` client-styles spec（sheet 挂载顺序） |
| Manual / QA | 悬停主按钮 / ghost / outline / 图标按钮目视验收 |

## Sources

- Reference: <https://ayase.cn/motion/#/component/metallic-paint>（React Bits `MetallicPaint`；本站 demo 为 CSS 渐变扫光版）
- Design language: [../design-language.md](../design-language.md)；motion: [../motion.md](../motion.md)
- Agent Note: `vendor/deepseek-harness/.agents/notes/implemented/feature/2026-09-13-button-metallic-paint-hover.md`
- Implementation: `metallic-paint.css` / `installThemeStyles`
