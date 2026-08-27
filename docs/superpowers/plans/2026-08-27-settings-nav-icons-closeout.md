# 设置导航图标收尾计划（第二轮加固）

上一轮计划 `2026-08-27-settings-nav-icons-harden.md` 已勾完，但父级复查发现残留缺口。本计划逐项关闭。

## 服务器图标重绘

- [ ] `IconServerOutline16` 移除 path 上的 `transform="translate(...) scale(...)"`，改为原生 16×16 正坐标展开路径。
- [ ] 保留 server/rack 语义（两层机架 + 指示点 + 状态条），几何完全落在 0–16 视窗内（旧版经变换后横向溢出视窗）。
- [ ] 描边光学重量约 1.3px，与 `IconSkillOutline16` / `IconBrowseOutline16` / `IconDeviceOutline16` 并排一致。
- [ ] 仅 `fill="currentColor"` 展开路径；根 SVG 维持 `viewBox="0 0 16 16"`、`fill="none"`。

## 无 transform 测试

- [ ] `icons.client.spec.tsx` 对全部四个 `settingsNavIconNames` 断言 SVG 内无任何带 `transform` 属性的元素。
- [ ] `settings-root.client.spec.tsx` 的 12-id 互异 + 未知回退断言保持通过、不改语义。

## 代码审查结论（Phase 1）

- [ ] `NAV_ICONS` 12 个 id（general/interface/appearance/models/agent-presets/plugins/skills/mcp/market/remote/about/usage-stats）映射互异组件，未知 id 回退 `IconSettingsOutline16` —— 无 bug，不改映射。
- [ ] 四个新增图标中仅 `IconServerOutline16` 含 path transform；`IconDeviceOutline16` / `IconInfoOutline16` / `IconChartOutline16` 已是原生正坐标路径。
- [ ] 不触碰 slot API、section id、市场/用量/启动器边界。

## 测试门槛（Phase 3）

- [ ] 聚焦：`settings-root.client.spec.tsx`、`icons.client.spec.tsx` 全绿。
- [ ] `pnpm run test:gui` 全绿。
- [ ] 触及源文件（`ui-primitives/src/icons/index.tsx`）per-file 100% 覆盖。

## 12 分区验证矩阵（Phase 4）

| 分区 | 验证面 |
| --- | --- |
| general / interface / appearance / models / agent-presets / plugins / skills / mcp / about | 组装设置页实机可见 |
| market / remote / usage-stats | 优先尝试桌面 profile / patch overlay 挂载后实机可见；不可行则记录原因并以映射测试覆盖 |

- [ ] 明暗两主题下 12 行导航截图：`/opt/cursor/artifacts/settings_nav_12sections_light.png`、`/opt/cursor/artifacts/settings_nav_12sections_dark.png`。
- [ ] 如实记录每个分区实际验证到的层级（实机 / 组装 / 仅测试）。

## 文档（Phase 5）

- [ ] Agent Note（中英）同步一句实现事实：四个图标均为原生 16×16 正坐标展开路径、path 无 transform。
- [ ] 映射未变 → 不动 handbook 附录、不建 Feature Card、不加 `.cursor/rules`。

## CI 与 PR 就绪（Phase 6）

- [ ] 推送 `cursor/unique-settings-nav-icons-cc5b`，HEAD 上 Desktop unit tests (windows + macos) + vendor-gui 三项全 SUCCESS。
- [ ] 若 vendor-gui 失败先诊断修复，不当 flake 忽略。
- [ ] 全绿且验证完成后把 PR #51 draft 置为 ready。
