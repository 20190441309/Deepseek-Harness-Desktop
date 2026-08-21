# 附录：设置 section id

桌面与验收常用的设置分区标识。实际注册以 harness / 预置插件的 `settings.section` 为准；跳转经 `shell:open-settings` / `settings-jump.js`。

| id / 称呼 | 用途 | 备注 |
| --- | --- | --- |
| `appearance` | 外观、主题、壁纸行 | `ui-theme` |
| `market` | 插件市场 | 内置 `dshmarket`；**无**独立 BrowserWindow |
| 模型 / Models | 提供方与模型 | QA §2；具体 id 以界面/插件为准 |
| MCP | MCP 服务器 | QA `TC-EXT-006` |
| Skills | 技能 | 同上 |
| 插件 / Plugins | 已装插件管理 | 与市场分区配合 |
| About | 关于 / 更新入口 | 常触发 `checkUpdate` |

托盘「插件市场」必须落到设置内 `market`，见 `TC-EXT-002`、`TC-DESK-002`。

深链实现：`src/main/settings-jump.js`。变更 id 时同步本表、市场 Feature Card 与 QA 文案。
