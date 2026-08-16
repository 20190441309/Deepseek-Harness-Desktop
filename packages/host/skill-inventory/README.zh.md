# @deepseek-ai/dsh-host-skill-inventory

[English](README.md) | 中文

为 Settings 的 Skills 页提供 Host Remote `skillInventory`。`list` 与 `get` 读取 `ctx.skills`，不过滤 composer 的 `isUserInvocable`，并补上 `path`、`source` 与 `writable`。`create` 写入 `$DSH_HOME/skills/<name>/SKILL.md` 或 `<cwd>/.dsh/skills/<name>/SKILL.md`。`update`、`delete` 与 `setInvocation` 只写 `user-dsh`、`user-agents`，以及在提供 `cwd` 时的 `project-dsh` / `project-agents`。启停沿用已有 frontmatter：`disable-model-invocation` 与 `user-invocable`。bundled、runtime 与 custom skill 只读。

该服务仅供 Remote 使用。Client 包通过 [`api-remotes`](../../api/remotes/README.zh.md) 消费。composer 的 `skill.list` RPC 不变。

## 模型体验

无，因为这个 Host Remote 不注册提示词、工具、消息或提供方请求。

#### KV Cache 影响

无；本包从不组装模型输入。

## 已知限制与暂缓事项

- **没有 skill 市场** — 创建只写本地文件；从目录安装不在范围内。
- **创建后不可改名** — 重命名等于删除再创建。
