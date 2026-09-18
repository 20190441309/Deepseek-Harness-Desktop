# Feature: Boot page

| Field | Value |
| --- | --- |
| **id** | `boot-page` |
| **status** | `active` |
| **last verified (restart)** | 2026-09-08 — 105 项 controller/window/IPC 检查通过；延迟 boot 导航回归及隔离 Electron 内置重启恢复可见 Bot 界面通过 |
| **last verified** | 2026-09-18 — 中区加载徽标换鲸鱼娘奔跑动画：`.mark` 内容改 `<img class="mark-anim" src="../../assets/whale-running.webp">`（8 帧循环 112px）+ `mark-still` 静帧 `assets/poster.png`（`prefers-reduced-motion` 下互换）；旋转准星 `.reticle` 及其 `spin` keyframes 删除；离屏截图两帧对比确认动画在播、112px 可辨。旧记录：中区徽标从 DeepSeek 鲸鱼线稿换成鲸鱼娘大头（`pet-head.png` img、`.mark` 抬扫描线之上）。旧记录：2026-09-01 — `window-harness-cover` 的 showBoot 用例按 `REMOTE_FEATURE_ENABLED` 断言 `--dshd-remote-feature`（停放为 `0`），不再因旧 `=1` 断言在 `showBoot()` 前失败而挂死插件 boot watch。此前 2026-08-26 — D3 双恢复面收敛：错误态新增「回启动器排查」跳板（`shell:open-launcher` 放开 BOOT 角色、boot 发起附带 show-tab home 直达 Recovery Board）；boot 页动作固定为瞬时三件（重试 / 取消自动重启 / 下载日志）+ 跳板，插件级恢复只在 Recovery Board。此前 2026-08-23 — 验收合同改为 CI 安装包全表；`qa:packaged` 仅 rehearsal |

## User paths

1. 冷启动先开启动器（更新 / 导入 / 版本 / 问诊）。启动桌面端后，主窗见仪器画布：鲸鱼娘奔跑加载动画（`assets/whale-running.webp` 8 帧循环 112px，`.mark` 提到扫描线遮罩之上，`prefers-reduced-motion` 换 `assets/poster.png` 静帧）、品牌名、状态戳、等宽日志；插件进度留在此页。
2. 就绪后露出官方 Web UI；不切到官方「正在加载插件」页代替 boot。
3. 失败：ERROR 态、重试、导出日志，另有「回启动器排查」跳板打开启动器 home tab（Recovery Board）；用户插件弄挂可跳过插件树后再试完整插件。插件级排查（归因、逐项/批量禁用）在 Recovery Board 做，不在 boot 页。

## Invariants

- 启动页是整窗仪器画布例外；`--boot-*` **不得**扩散到启动器、设置、关闭遮罩、标题栏或官方 Web UI。
- 禁止 NERV / MAGI / SEELE / EVA 等商标或官方标志挪用。
- 插件装载进度留在 boot 画布。
- 未完成的 boot 导航由恢复与手动重启共享等待；旧导航不得在新的 Harness 揭示后覆盖主界面。
- 恢复动作与 [plugin-recovery 流程](../handbook/flows/plugin-recovery.md) 一致。
- boot 页动作面 = 瞬时动作（重试 / 取消自动重启 / 下载日志）+「回启动器排查」跳板，仅此四件；插件级恢复操作**只**存在于启动器 Recovery Board，boot 页不得长出自己的副本（`boot-recovery.test.js` 钉死动作行内容）。跳板仅在 settled `error` 态出现（自动重启排程/进行中不出现），经 `shell:open-launcher`（BOOT 角色 → 启动器 home tab）。
- 覆盖安装同一桌面版本时，`userData/runtime/<version>` 必须与安装包 Harness pin + 归档大小一致；无戳或戳不匹配则重新解压。不得只因 `bin.js` 存在而沿用旧 runtime。

## Allowed touch

- `src/renderer/boot.html` / `boot.css` / `boot.js` / `boot-tokens.css` / `boot-recovery.js`
- `src/main/harness-controller.js`、`harness-extract.js`、`window.js`、`boot-log-dump.js`、`plugin-tree-failure.js`、`plugin-recovery-actions.js`
- 本卡与 handbook boot / plugin-recovery 章

## Do not touch

- 把 `--boot-*` 用到非启动页
- 用空态卡片或官方加载页替换仪器画布产品路径

## Gates

| Kind | What |
| --- | --- |
| Automated | boot / harness-controller / plugin-recovery 单测；`qa:packaged` 可 rehearsal overlay stamp（**不能**当发版 Pass） |
| Manual / QA | 每次发布前 [production-acceptance](../qa/production-acceptance-test-cases.md)：`TC-INST-003`…`007`、`TC-INST-012`、`TC-INST-013`；对象=CI Setup |

## Sources

- Decision: none

- Handbook：[../handbook/modules/boot-lifecycle.md](../handbook/modules/boot-lifecycle.md)、[../handbook/flows/boot-to-ready.md](../handbook/flows/boot-to-ready.md)
- Design：[../design-language.md](../design-language.md#桌面启动页)
- Spec：[../superpowers/specs/2026-08-18-plugin-startup-recovery-design.md](../superpowers/specs/2026-08-18-plugin-startup-recovery-design.md)
