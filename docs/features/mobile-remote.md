# Feature: 手机远程（隐藏）

| Field | Value |
| --- | --- |
| **id** | `mobile-remote` |
| **status** | `parked`（侧栏入口隐藏；网关源仍打包，不监听） |
| **last verified** | 2026-08-23 — `REMOTE_FEATURE_ENABLED = false`；preload 不暴露 Remote IPC；`qa:source` `remote.footerAbsent`；`qa:composer` 磁盘 `remoteEnabled: true` 仍不监听 |

## User paths

1. 启动后侧栏底部**没有**手机 **远程** 图标，也打不开配对弹窗。
2. 3180 **不**监听；磁盘上即使曾 `remoteEnabled: true` 也会被规范成关。
3. 以后要重新打开：把 `src/main/config.js` 与 `src/preload/index.js` 的 `REMOTE_FEATURE_ENABLED` 改回 `true`（两处必须同步），并先把本卡改为 `active`。

## Invariants

- 主进程仍构造 `RemoteGateway`，不走 `createDisabledRemote`。停放时 `available === false`，`listening !== true`。
- Preload **不**暴露 `getRemote` / `saveRemote` / `rotateRemoteToken` / `unbindRemoteDevice`，因此 `ui-settings-remote` 不注册侧栏入口。IPC 处理仍在，调用会失败关闭。
- `vendor` 里的 `ui-settings-remote` 与 `mobile/web` 仍随仓库打包；不删插件源。
- Token 只在 `#offer=`；中继 origin 必须是 HTTPS。`?token=` 不配对。重新打开产品时这些仍成立。

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
| Automated | `node --test src/main/config.test.js src/main/ipc.test.js src/preload/shell-api.test.js src/main/composer-official-qa.test.js src/main/release-ui-walk.test.js` |
| Manual / QA | [TC-NEG-001](../qa/production-acceptance-test-cases.md)（入口隐藏且不监听）；[TC-REM-001](../qa/production-acceptance-test-cases.md) … [TC-REM-003](../qa/production-acceptance-test-cases.md) 为 **N/A**（产品停放） |

## Sources

- Handbook: [../handbook/modules/mobile-remote.md](../handbook/modules/mobile-remote.md)、[../handbook/flows/remote-pair.md](../handbook/flows/remote-pair.md)
- Spec: [../superpowers/specs/2026-08-20-mobile-web-client-design.md](../superpowers/specs/2026-08-20-mobile-web-client-design.md)
- Plan: [../superpowers/plans/2026-08-20-mobile-web-client.md](../superpowers/plans/2026-08-20-mobile-web-client.md)
- Mock: [../superpowers/mocks/2026-08-20-mobile-phone.html](../superpowers/mocks/2026-08-20-mobile-phone.html)
- Agent Note: [vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-22-desktop-phone-remote.md](../../vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-22-desktop-phone-remote.md)
- Implementation: `src/main/remote.js`、`src/main/config.js` `REMOTE_FEATURE_ENABLED`、`src/preload/index.js`、`mobile/web/`、`ui-settings-remote`
