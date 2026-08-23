# 模块：构建、钉版与发版

## 职责与非目标

**职责：** vendor harness 钉版、本地构建客户端、electron-builder 出包、CI 发版。  
**非目标：** 不在手册复述完整 CI YAML；不把源码钉伪称为已发包装钉。

## 用户路径（开发者）

```powershell
npm install
npm run setup:harness
npm start
npm test
npm run dist          # Windows
npm run dist:mac      # macOS 真机
```

同步上游：`npm run sync:harness -- --ref … --sha …`（以 `vendor/harness-upstream.json` 为准）。

## 架构要点

- 钉：`vendor/harness-upstream.json`（当前文档化基线见根 README）。  
- 改 client 后：`vendor/deepseek-harness` 内 `pnpm run build:lib:client` 再重启桌面。  
- 安装包经 GitHub Actions `release.yml` **windows job** 产出。验收对象是该 artifact，不是本地 `npm run dist`。`afterPack` 会把打包时的 `node.exe` 打进包内，本机 Node 24 ≠ CI Node 22。

## 实现入口

- `scripts/`（setup/sync/dist/QA）
- `package.json` scripts
- `.github/workflows/`

## 不变量

- 验收表：每次发布前对 **CI 安装包 SHA** 走完 [production-acceptance-test-cases.md](../../qa/production-acceptance-test-cases.md)。禁止把源码钉写成已发包装钉；禁止用本机 dist 给该表打 Pass。  
- 现 `v*` tag 会立刻 `gh release create`，来不及先走表。合规顺序见验收表 §0.1。  
- SQLite 等格式与 rc 版本兼容性以发版说明为准。

## 门槛

- QA：每次发布前生产验收全表（CI 包）；`TC-INST-001`、`TC-INST-008`、`TC-INST-009`、`TC-INST-012`、`TC-INST-013`

## 延伸阅读

- [README.md](../../../README.md) 开发节
- harness 上游 [docs/architecture.md](../../../vendor/deepseek-harness/docs/architecture.md)
