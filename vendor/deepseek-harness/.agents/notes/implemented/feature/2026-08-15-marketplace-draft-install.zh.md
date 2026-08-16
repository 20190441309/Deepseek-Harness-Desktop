# Agent Note: 通过会话草稿与 install_dsh_plugin 安装插件

Status: implemented

[English](2026-08-15-marketplace-draft-install.md) | 中文

## 问题

设置 → 插件 → 插件市场通过 Electron IPC 安装 GitHub 插件：先跑 `dsh plugin --profile web add`，再立刻重启 Harness。操作者从未发送会话消息，因此 prepare 脚本风险、SHA 锁定、`allowBuilds` 和重启都发生在产品其余部分所使用的对话之外。

只预填输入草稿、不提供 Host 工具，模型仍需猜测 `dsh plugin add`、pnpm shim 和桌面重启。卸载已有确认对话框，不需要走这段对话。

## 决策

插件市场的「安装」会关闭设置，在当前会话所属工作区（否则 `recentWorkspaceId`）里创建空白会话并打开，再用口语中文文案 `setDraft`，文案带上目录里的 `installSpec`。它不调用 `submit`。卸载仍走设置里的一键路径。

仅桌面使用的 Host 插件被复制到 `$DSH_HOME/profiles/web/desktop-plugins/install-dsh-plugin/`，并由一段托管的 `cordis.patch.yml` 块插入，注册 `install_dsh_plugin`（`spec`，可选 `allowBuilds[]`）。execute 向 Electron 在 `127.0.0.1` 上用随机端口和 bearer token 启动的回环控制服务器 POST；URL 与 token 通过 `DSH_DESKTOP_INSTALL_URL` / `DSH_DESKTOP_INSTALL_TOKEN` 注入 Harness 子进程。处理函数包装现有 `installPlugin`（SHA 锁定、DROPPED、pnpm shim、`allowBuilds`）。两层都在任何东西到达 `pnpm add` 之前用 `^github:owner/repo[#ref]$` 校验规格：工具端在客户端返回结构化失败，控制端点回答 400 且绝不调用 `installPlugin`。`needsAllowBuilds` 是规范工具返回值，不是抛出的失败。成功安装的 HTTP 200 返回后，Electron 等待约 500ms 再重启 Harness，以便 `tool/result` 先落盘；这段延迟是固定的宽限期而不是 ACK——比延迟更慢的 tool/result 会被截断，这一点被接受，而不是引入一套重启协议。该插件不进入官方 web-app 组合包。独立市场窗口会聚焦主窗口并预填同一份草稿，不调用 `installPlugin`。

## 曾考虑的替代方案

**继续从设置里一键走 IPC 安装。** 否决：prepare 脚本在本机执行，却没有一条点名规格的会话消息，操作者也无法在输入框里检查或拒绝该请求。

**预填草稿并自动发送。** 否决：发送才是操作者的确认；不能因为点了目录按钮就安装。

**只预填草稿、不提供 `install_dsh_plugin`。** 否决：SHA 锁定、pnpm shim、`allowBuilds`、DROPPED 和重启都是桌面安装器细节，模型无法用 bash 稳定复现。

**把该工具放进官方 web-app 组合包。** 否决：浏览器里的 `dsh web` 没有 Electron 安装器；Host 工具在那里只会空转或撒谎。profile patch 由桌面端拥有。

## 后果

设置页的安装不再调用 `installPlugin`。IPC `shell:install-plugin` 留给其他桌面调用方；控制通道在进程内调用 `installPlugin`。测试钉死：安装会预填草稿且不打开确认对话框；`close` 会传到 `settings.plugins.tab`；控制服务器先响应再重启；`needsAllowBuilds` 不重启；空规格和非 `github:` 规格在两层都失败关闭且不触发安装器。草稿的空白会话通过 `workspaces.connectWorkspace` 连接——正规的「新会话」入口——绝不直接 `sessions.create`（sessions 契约有意不暴露它）。
