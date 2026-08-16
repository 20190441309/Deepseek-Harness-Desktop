# @deepseek-ai/dsh-client-ui-settings-skills

[English](README.md) | 中文

Web Settings 栏目 `skills`（order 20）。页面按来源分组列出 `ctx.remote.skillInventory` 行，并通过 `create` / `update` / `delete` / `setInvocation` 写用户技能。产品文案为中文。composer 的 `/` 选择器仍使用 `skill.list`。

## 模型体验

无，因为这个浏览器 Settings 页不注册提示词、工具、消息或提供方请求。

#### KV Cache 影响

无；本包从不组装模型输入。

## 已知限制与暂缓事项

- **没有 skill 市场** — 添加写入 `$DSH_HOME/skills/<name>/SKILL.md`。
- **项目技能需要 cwd** — 页面读取当前 session 的 cwd；没有 session 时只列出用户与捆绑技能。
