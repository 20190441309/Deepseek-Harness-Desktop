# @deepseek-ai/dsh-client-ui-settings-skills

[English](README.md) | 中文

Web Settings 栏目 `skills`（order 16）。页面把 `ctx.remote.skillInventory` 呈现为可搜索的发丝目录，带一个来源筛选。每次 Remote 调用都会带上当前 session 的 `sessionId` 与 `cwd`，让 Host 读取该存活 Agent 的分层目录。可写行提供模型调用 Switch、打开现有编辑器，并提供删除；只读行没有删除。创建可选择用户根或活动项目的 `.dsh/skills` 根，并接受初始调用开关。目录会响应当前 session 变化，并抑制上一个 session 或项目的迟到响应。composer 的 `/` 选择器仍使用 `skill.list`。

## 模型体验

无，因为这个浏览器 Settings 页不注册提示词、工具、消息或提供方请求。

#### KV Cache 影响

无；本包从不组装模型输入。

## 已知限制与暂缓事项

- **没有 skill 市场** — 添加写入 `$DSH_HOME/skills/<name>/SKILL.md`。
- **preset 目录需要存活 session** — 没有当前 session 时页面既不发送 `sessionId` 也不发送 `cwd`，Host 回退到全局 skill 层，standard preset 的项目/捆绑根不会出现。
