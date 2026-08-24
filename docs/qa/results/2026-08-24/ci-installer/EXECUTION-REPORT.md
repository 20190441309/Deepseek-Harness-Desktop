# CI 安装包验收（0.2.7）· 2026-08-24

对象是 GitHub Actions **Build installers** windows artifact（`workflow_dispatch`，**未**打 tag）。

## 0. 产物

| 项 | 值 |
| --- | --- |
| Actions run | https://github.com/ChisaAlter/Deepseek-Harness-Desktop/actions/runs/32727819174 |
| git SHA | `52bdfbc1a6e41c371556914d9c697cd90edad084` |
| Setup SHA256 | `602DC9C01AADC87AE0928BD49B2DCCB0CB9E75218BFD73E9872B6BD0FEE12B27` |
| 安装 | `/S` → `%LOCALAPPDATA%\Programs\Deepseek-Harness-Desktop\` |
| bundled node | **v22.23.2** |
| 家目录 | `%APPDATA%\Deepseek-Harness-Desktop`（真实 userData，无 `--user-data-dir`） |

## 1. 启动器 / 安装（自动化）

| ID | 结果 | 证据 |
| --- | --- | --- |
| TC-INST-001 | **Pass** | `install-p0-report.json` |
| TC-INST-013 | **Pass** | bundled node v22.23.2 |
| TC-LAUNCH-001 | **Pass** | 冷启动仅 launcher |
| TC-LAUNCH-002 手动 | **Pass** | 点「启动桌面端」进 harness |
| TC-LAUNCH-002 自动 | **Pass** | `autoStartDesktop:true` 冷启动 harness 3080 自动起来 |
| stop-desktop | **Pass** | 「关闭桌面端」→ idle |
| TC-INST-002 | **Pass** | 二次启动无第二套 harness |
| TC-LAUNCH-006 关窗 | **Pass** | 关启动器后 harness 仍跑 |
| TC-LAUNCH-006 再开 | **Blocked** | 托盘/菜单未自动化 |
| TC-LAUNCH-007 | **Pass*** | celadon 配置下 launcher 仍官方白底（浅色探针）；深色半未双探 |
| TC-LAUNCH-003 | **N/A** | 已装 0.2.7 > `/releases/latest` 0.2.6 |
| TC-LAUNCH-004 | **N/A** | dest 已有 sessions |
| parked remote/dshbot | **Pass** | 无远程 / 无 dshbot tab |

脚本：`install-p0-probe.mjs`、`install-p0-continue.mjs`。

## 2. 附录 A（已装 exe + 真实 profile）

`run-installed-appendix.mjs`（`DSH_SMOKE` + `DSH_QA_APPENDIX` + `DSHD_ALLOW_PACKAGED_QA=1`，**无** `--user-data-dir`）。

| 步骤 | 结果 |
| --- | --- |
| 附录 1–5 轮（TC-CHAT-001…005） | **Pass**（验证码 **456**） |
| appendix.editUser（TC-CHAT-009） | **Pass** |
| appendix.reject（TC-APPROVE-002） | **Fail** | 只读模式切换后未见预期拒绝审批流 |
| appendix.vision（TC-MODEL-005 附加） | **Fail** | 写权限/vision 路由被拒 |

PTY smoke、titlebar Git/分支/Surfaces 探针：**Pass**（见 `install-appendix-report.json` logTail）。

## 3. 仍未覆盖 / Blocked

- TC-LAUNCH-005 造障 Recovery、TC-INST-004…011 造障
- TC-DESK-002 / 004 托盘退出手测
- TC-WS-006 兄弟仓、TC-TERM-002、TC-GIT-003、壁纸图库全表
- §16 签字

## 4. 结论

**CI 0.2.7 包：启动器主路径 + 自动进桌面 + 附录五轮对话已在真实安装环境 Pass。**  
**门禁缺口：** TC-APPROVE-002 自动化 Fail、托盘再开启动器/退出未测、生产表 §16 未签。

**建议：** 手测托盘 TC-LAUNCH-006 后半 + TC-DESK-002/004 后，产品负责人决定是否对审批/vision 附加步骤书面豁免，再填 §16 打 tag。
