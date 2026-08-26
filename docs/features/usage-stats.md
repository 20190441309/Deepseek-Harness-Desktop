# Feature: 用量统计

| Field | Value |
| --- | --- |
| **id** | `usage-stats` |
| **status** | `active` |
| **last verified** | 2026-08-26 — D1 挂载机制随 desktop-launcher 单一 overlay 收敛：`ensureUsagePanelPlugin` 不再向 `cordis.patch.yml` 写受管块，改写 `desktop-plugins/dsh-usage-panel/desktop-usage-panel.patch.yml`（控制器仅全量启动经 `--patch` 传；skip 启动不预置不变）；禁用 / ensure 失败 / 市场 bundle 接管时删 overlay 不传（杜绝双挂载与陈旧 overlay）；旧受管块每次启动被 strip（迁移）。此前 2026-08-24 — 热力图改为半年窗口内按月切换（默认当月 UTC，‹ › 选月；色阶按当月非零日四分位）。Host 仍返 182 日桶。自动化：`vendor/dsh-usage-panel` `npm test` + `npm run build`。 |

## User paths

1. 设置 → 「用量统计」（`usage-stats`）：KPI、半年窗口内按月可选 UTC 热力图、按模型柱/环、Top 会话、导出。
2. 无计费用量（含仅空白会话）走空态文案；扫描失败仍出仪表盘，不挡启动。
3. 刷新从 host RPC 重扫；数字来自本机会话投影，不写回日志。

## Invariants

- 预置包名 `dsh-usage-panel`；设置 section id `usage-stats`；投影 key `usagePanel`。同一 profile 只挂一份。
- 挂载走桌面自有 overlay（`desktop-usage-panel.patch.yml`，仅全量启动经 `--patch` 传），不写 `cordis.patch.yml` 受管块（该文件纯用户所有，见 desktop-launcher 卡）；市场 bundle 已挂载或插件被禁用时 overlay 必须删除（insert + bundle 同时组合 = 双挂载）。
- 桌面 `desktop-plugins` 副本赢过市场装的同名目录（junction 覆盖非 junction 安装）。
- 只统计 Token 四桶；不做余额 / CNY / 峰谷价。
- 日桶 UTC；字幕声明 UTC。
- 颜色只走 `--dsw-alias-*` / `--dsw-static-deepseek-*`；刷新/导出用 `ui-primitives`。
- 安装落点是桌面 `dsh-home/profiles/web`，不是 `~/.dsh`（见 [dsh-home](dsh-home.md)）。
- 预置失败只打日志，不挡 `dsh web`。

## Allowed touch

- `src/main/usage-panel-preset.js`、`harness-controller.js`、`index.js`（启动接线）
- `vendor/dsh-usage-panel/`（预置插件源与改版 client）
- `scripts/setup-harness.js`、`scripts/after-pack.js`、`package.json` extraResources
- 相关桌面测试、本卡、handbook 用量章、QA `TC-EXT-008`

## Do not touch

- 上游 token-meter / StatsLine / ContextMeter
- 账户余额、计价、侧栏 footer、会话浮卡
- 无关邻域：市场窗、壁纸、Surfaces（除非用户扩大 Touching）

## Gates

| Kind | What |
| --- | --- |
| Automated | `src/main/usage-panel-preset.test.js`、`harness-controller.test.js` 接线、extraResources / gitignore 钉死；`qa:source` / `release-ui-walk` 的 `usage-stats` 分区存在 |
| Manual / QA | `TC-EXT-008`（空态含仅空白会话算通过）；有用量时 KPI 整数（不到 10 万）为 P1 |

## Sources

- Handbook：[../handbook/modules/usage-stats.md](../handbook/modules/usage-stats.md)
- Spec：[../superpowers/specs/2026-08-23-usage-stats-design.md](../superpowers/specs/2026-08-23-usage-stats-design.md)
- Implementation entry：`src/main/usage-panel-preset.js` `ensureUsagePanelPlugin`
