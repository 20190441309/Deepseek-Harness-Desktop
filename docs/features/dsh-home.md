# Feature: Desktop Harness home

| Field | Value |
| --- | --- |
| **id** | `dsh-home` |
| **status** | `active` |
| **last verified** | 2026-08-23 — unit 688；TC-INST-011；`qa:source` / `qa:composer`；`smoke:packaged`；NSIS Setup；TC-INST-009 overlay |

## User paths

1. 安装或覆盖升级后冷启动：桌面 **不读** 官方 `~/.dsh`；Harness 只用 `userData/dsh-home`（Windows：`%APPDATA%\Deepseek-Harness-Desktop\dsh-home`）。
2. 设置 → 市场安装进入 `dsh-home/profiles/web`，不是 `~/.dsh`。
3. 底栏终端里运行官方 `dsh` 仍使用 `~/.dsh`（或用户自己的 `DSH_HOME`）。
4. 覆盖升级后会话 / 主题 / 自定义模型须在桌面里重配；壳层已存的默认 API key 与工作区路径仍可用。

## Invariants

- 桌面 `$DSH_HOME` 仅为 `userData/dsh-home`（测试/调试可用 `DSHD_HOME`）。忽略环境 `DSH_HOME`，永不回落 `~/.dsh`。
- 桌面进程不读、不写、不迁移、不清理 `~/.dsh`。
- 不把桌面 home 写进 Electron `process.env.DSH_HOME`；PTY 不注入该值。
- `dsh web` 与 `dsh plugin` 子进程的 `DSH_HOME` 覆盖为桌面 home。
- `--skip-user-plugins` 恢复状态机不变。

## Allowed touch

- `src/shared/dsh-home.js` 与其单测
- `src/main/index.js`、`dsh.js`、`plugins.js`、`marketplace-install.js`、`workspace-authority.js`
- `src/shared/themes.js` 读 `settings.yaml` 的路径
- `scripts/smoke-workspace.mjs` 与 `qa:source` / `qa:composer` / packaged smoke 的 spawn 环境
- 本卡、handbook `modules/dsh-home.md`、`.cursor/rules/dsh-home-product.mdc`、QA TC-INST-009 / TC-INST-011

## Do not touch

- vendor harness 源码
- 把恢复改成版本 bump 先 skip
- Appearance 图源、市场独立窗、boot 仪器 token

## Gates

| Kind | What |
| --- | --- |
| Automated | `src/shared/dsh-home.test.js`；spawnEnv / pluginEnv / PTY / themes / marketplace / workspace-authority；冒烟不得向 Electron 注入 `DSH_HOME` |
| Manual / QA | `TC-INST-009`（须重配）、`TC-INST-011`（毒化 `~/.dsh` 仍能进主界面） |

## Sources

- Spec：[../superpowers/specs/2026-08-22-desktop-dsh-home-design.md](../superpowers/specs/2026-08-22-desktop-dsh-home-design.md)
- Handbook：[../handbook/modules/dsh-home.md](../handbook/modules/dsh-home.md)
- Recovery（不改）：[../superpowers/specs/2026-08-18-plugin-startup-recovery-design.md](../superpowers/specs/2026-08-18-plugin-startup-recovery-design.md)
- Implementation：`src/shared/dsh-home.js`、`src/main/index.js` `whenReady`
