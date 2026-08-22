# Feature: 手机远程

| Field | Value |
| --- | --- |
| **id** | `mobile-remote` |
| **status** | `active` |
| **last verified** | 2026-08-22 — 网关与侧栏入口接线（单测；实机扫码待跑） |

## User paths

1. 侧栏底部手机图标打开 **远程** 弹窗 → 开 → 局域网（或 HTTPS 中继）→ 二维码。
2. 系统相机 / 浏览器扫码（`#offer=`）→ 登录 → `mobile/web` SPA：列会话、发消息、审批允许一次 / 拒绝。
3. 关远程后 3180 不再监听；默认 `remoteEnabled` 为关，不会在用户未打开时占口。

## Invariants

- 认证后的 HTML 是 `mobile/web` SPA，不是官方四栏 `dsh web`。`/api/*` 与 WebSocket 仍反代 `127.0.0.1:3080`。
- Token 只在 `#offer=`。Cookie `dsh_remote`。中继 origin 必须是 HTTPS。
- 侧栏 `ui-settings-remote` 已加载；preload 暴露 `getRemote` / `saveRemote` / `rotateRemoteToken` / `unbindRemoteDevice`。
- 主进程构造 `RemoteGateway`，不走 `createDisabledRemote`。未开启时 `listening !== true`。
- 手机 SPA 抄 `--dsw-alias-*`，不挂官方插件树，不用启动页 `--boot-*`。
- Android 应用内扫码不在本卡。

## Allowed touch

- `src/main/remote.js`、`mobile-web.js`、`index.js`（网关构造）、`ipc.js`、`config.js`（远程字段）
- `src/preload/index.js` — 仅 Remote IPC
- `mobile/web/` — SPA
- `vendor/deepseek-harness/packages/client/ui-settings-remote/`
- `vendor/deepseek-harness/packages/bundle/web-app/cordis.patch.yml` — `ui-settings-remote` 行
- 本卡、`docs/handbook/modules/mobile-remote.md`、`docs/qa/production-acceptance-test-cases.md` 远程条

## Do not touch

- 用 WebView 套官方四栏
- 明文 HTTP 中继 origin、token 进 query
- Appearance 图源 CRUD、启动页仪器画布
- 邻域：composer `@`/`$`、Files Mention（除非用户扩大 `Touching`）

## Gates

| Kind | What |
| --- | --- |
| Automated | `node --test src/main/remote.test.js src/main/ipc.test.js src/preload/shell-api.test.js src/shared/post-merge-ui.test.js src/main/composer-official-qa.test.js src/main/release-ui-walk.test.js mobile/web/**/*.test.js` |
| Manual / QA | [TC-NEG-001](../qa/production-acceptance-test-cases.md)（默认不监听）；[TC-REM-001](../qa/production-acceptance-test-cases.md) … [TC-REM-003](../qa/production-acceptance-test-cases.md) |

## Sources

- Handbook: [../handbook/modules/mobile-remote.md](../handbook/modules/mobile-remote.md)、[../handbook/flows/remote-pair.md](../handbook/flows/remote-pair.md)
- Spec: [../superpowers/specs/2026-08-20-mobile-web-client-design.md](../superpowers/specs/2026-08-20-mobile-web-client-design.md)
- Plan: [../superpowers/plans/2026-08-20-mobile-web-client.md](../superpowers/plans/2026-08-20-mobile-web-client.md)
- Mock: [../superpowers/mocks/2026-08-20-mobile-phone.html](../superpowers/mocks/2026-08-20-mobile-phone.html)
- Agent Note: [vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-22-desktop-phone-remote.md](../../vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-22-desktop-phone-remote.md)
- Implementation: `src/main/remote.js`、`src/main/index.js`、`mobile/web/`、`ui-settings-remote`
