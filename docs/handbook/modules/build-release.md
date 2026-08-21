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
- 安装包经 GitHub Actions 打 `v*` 标签产出。

## 实现入口

- `scripts/`（setup/sync/dist/QA）
- `package.json` scripts
- `.github/workflows/`

## 不变量

- 验收表：源码钉可能超前安装包；禁止把源码钉写成已发包装钉（QA §0.1）。  
- SQLite 等格式与 rc 版本兼容性以发版说明为准。

## 门槛

- QA：`TC-INST-001`、`TC-INST-008`、`TC-INST-009`  
- `npm test`；发版前生产验收表 P0

## 延伸阅读

- [README.md](../../../README.md) 开发节
- harness 上游 [docs/architecture.md](../../../vendor/deepseek-harness/docs/architecture.md)
