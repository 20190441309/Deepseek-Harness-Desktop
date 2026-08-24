# 0.2.7 发版交接（2026-08-24）

## 代码门禁

- [x] `npm test` — 875/875（本地）
- [x] `node scripts/check-release-version.mjs v0.2.7`
- [ ] GitHub `test.yml` 对**即将打 tag 的 commit** 变绿（release.yml 发版前强制）

## 合规发版顺序（production-acceptance-test-cases.md）

**当前阶段：只打包、先本地/安装包验收，不打 `v0.2.7` tag、不发 GitHub Release。**

1. **Push 本 commit** → 开 PR 等 `Desktop tests` workflow 绿（`test.yml` 仅 PR / main push 触发）。
2. **Actions → Build installers → Run workflow**（`workflow_dispatch`，选 `release/0.2.7-launcher`，**不要**打 tag）。
3. 下载 artifact `DeepSeek-Harness-windows-x64` 里的 `Deepseek-Harness-Desktop-Setup-0.2.7.exe`，算 SHA256，**在本机安装跑** `production-acceptance-test-cases.md`（含 `TC-LAUNCH-*`）。
4. 验收通过后再：填 §16 → 打 tag `v0.2.7` → push tag → `release.yml` 发布（可先 draft）。

## 源码实机预检（非打包验收）

见 `docs/qa/results/2026-08-24-stop-autostart/live-report.json` 与 `quick-stop.mjs`（真实 profile 关闭桌面端通过）。**不能**代替 §16 安装包验收。

## 发版说明

- `.github/release-notes.md` 已补启动器 / 启动时 / 关闭桌面端条目。
