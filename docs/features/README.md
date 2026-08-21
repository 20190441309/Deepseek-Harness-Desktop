# Feature Spine（产品知识脊梁）

可执行的产品契约索引：每张卡绑定用户路径、不变量、默认可改文件、测试门槛与来源链接。Agent 改产品行为时先读卡、声明 `Touching: <id>`，再动手。

蓝图与模块详解见 [产品手册](../handbook/README.md)。

## 与其他文档的分工

| 层 | 职责 | 本树是否替代 |
| --- | --- | --- |
| [docs/handbook/](../handbook/README.md) | 蓝图、流程、模块当前态 | 否；卡片挂手册章 |
| [design-language.md](../design-language.md) / [motion.md](../motion.md) | 视觉与动效语言 | 否；卡片只链接 |
| [superpowers/specs](../superpowers/specs/) / [plans](../superpowers/plans/) | 设计与施工过程 | 否；定稿后把**不变量**收进卡片 |
| [qa/production-acceptance-test-cases.md](../qa/production-acceptance-test-cases.md) | 发版实机验收 | 否；卡片 `gates` 挂用例 ID |
| harness Agent Notes | 上游决策记录 | 否；桌面相关卡可链接 |
| `.cursor/rules/*.mdc` | 短 always-on 不变量 | 否；文末链到本卡，细节以卡为准 |

本树**不做**第二套 Wiki，不复制 harness doc-sync。卡片半页内；长文留在 handbook / spec / note。

## 何时新建 / 更新

- **新建：** 产品行为已定且会被反复改（尤其易被 Agent 冲掉）时，从 [_template.md](_template.md) 复制。
- **更新：** 不变量或关键路径变了；或改完后刷新 `last verified`。
- **局部修复不改契约：** 会话写明「无卡 / 不改产品契约」，diff 仍应尽量小。

## 会话开场模板

```text
Touching: wallpaper-gallery
Goal: <一句>
Do not: Appearance 图源、邻域重构
Gate: <卡上 gates>
```

提交说明建议：`feature(<id>): …`。协议全文见仓库根 [AGENTS.md](../../AGENTS.md#feature-spine)。

## 索引

| id | 一句话 | 主入口 | gates 摘要 |
| --- | --- | --- | --- |
| [wallpaper-gallery](wallpaper-gallery.md) | Appearance 行 + 图库窗；图源只在窗内 | `WallpaperRow` / `WallpaperGalleryModal` | TC-APP-002…010 |
| [marketplace-settings](marketplace-settings.md) | 设置内市场；无独立窗 | `marketplace-install` / dshmarket | TC-EXT-001…005 |
| [surfaces-work-loops](surfaces-work-loops.md) | 右栏工作环，非空态卡片 | preview / ui-files | TC-SURF-001…007 |
| [boot-page](boot-page.md) | 仪器启动画布 + 插件进度/恢复 | `boot.*` / harness-controller | TC-INST-003…007 |
| [terminal-drawer](terminal-drawer.md) | 底栏 PTY 工作环 | `pty.js` / ui-user-terminal | TC-TERM-001…004 |
| [settings-select](settings-select.md) | 停放：设置页统一下拉原语；MCP 传输下拉首个使用点 | `ui-primitives` / `McpSection` | vendor vitest（手动） |
