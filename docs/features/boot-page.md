# Feature: Boot page

| Field | Value |
| --- | --- |
| **id** | `boot-page` |
| **status** | `active` |
| **last verified** | 2026-08-21 — card authored from design-language §桌面启动页 + QA §1 |

## User paths

1. 冷启动见仪器画布：标志、品牌名、状态戳、等宽日志；插件进度留在此页。
2. 就绪后露出官方 Web UI；不切到官方「正在加载插件」页代替 boot。
3. 失败：ERROR 态、重试、导出日志；用户插件弄挂可跳过插件树后再试完整插件。

## Invariants

- 启动页是整窗仪器画布例外；`--boot-*` **不得**扩散到设置、关闭遮罩、标题栏或官方 Web UI。
- 禁止 NERV / MAGI / SEELE / EVA 等商标或官方标志挪用。
- 插件装载进度留在 boot 画布。
- 恢复动作与 [plugin-recovery 流程](../handbook/flows/plugin-recovery.md) 一致。

## Allowed touch

- `src/renderer/boot.html` / `boot.css` / `boot.js` / `boot-tokens.css` / `boot-recovery.js`
- `src/main/harness-controller.js`、`window.js`、`boot-log-dump.js`、`plugin-tree-failure.js`、`plugin-recovery-actions.js`
- 本卡与 handbook boot / plugin-recovery 章

## Do not touch

- 把 `--boot-*` 用到非启动页
- 用空态卡片或官方加载页替换仪器画布产品路径

## Gates

| Kind | What |
| --- | --- |
| Automated | boot / harness-controller / plugin-recovery 相关单测 |
| Manual / QA | `TC-INST-003` … `TC-INST-007` |

## Sources

- Handbook：[../handbook/modules/boot-lifecycle.md](../handbook/modules/boot-lifecycle.md)、[../handbook/flows/boot-to-ready.md](../handbook/flows/boot-to-ready.md)
- Design：[../design-language.md](../design-language.md#桌面启动页)
- Spec：[../superpowers/specs/2026-08-18-plugin-startup-recovery-design.md](../superpowers/specs/2026-08-18-plugin-startup-recovery-design.md)
