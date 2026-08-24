# 0.2.7 发版交接（2026-08-24）

## 代码门禁

- [x] `npm test` — 876/876（本地）
- [x] `node scripts/check-release-version.mjs v0.2.7`
- [x] **Build installers** CI 绿（run [32727819174](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/actions/runs/32727819174)，SHA `52bdfbc1a6`）
- [ ] GitHub `test.yml` 对 PR #23 变绿

## CI 安装包（已下载并 `/S` 安装）

| 项 | 值 |
| --- | --- |
| Setup SHA256 | `602DC9C01AADC87AE0928BD49B2DCCB0CB9E75218BFD73E9872B6BD0FEE12B27` |
| 自动化子集 | 见 `ci-installer/EXECUTION-REPORT.md` — 启动器 P0 + **附录 1–5 轮 Pass** |
| 全表 P0 | **未闭环** — 审批拒绝/vision 附加 Fail；托盘/§16 待办 |

## 合规发版顺序（production-acceptance-test-cases.md）

**当前阶段：CI 包已装、启动器子集通过；仍不打 `v0.2.7` tag。**

1. 走完剩余 P0（至少附录 A + 托盘 + 自动进桌面路径）。
2. 填 §16，勾「Release 将上传同一 SHA」。
3. 再打 tag / 更新 draft Release。

## 源码实机预检（非打包验收）

见 `docs/qa/results/2026-08-24-stop-autostart/`。**不能**代替 §16。

## 发版说明

- `.github/release-notes.md` 已补启动器 / 启动时 / 关闭桌面端条目。
