# dshmarket — reference tree only（已与上游分离）

本目录是第三方 [dsh-market](https://github.com/dsh-market/dsh-market)（npm `dshmarket`，MIT）1.14.0 的源码快照，**仅作移植参考保留**：

- 桌面市场已内置为桌面自有代码：设置分区 `market` 由
  `vendor/deepseek-harness/packages/client/ui-settings-market`（桌面 fork 包）注册，
  目录 / 安装 / 卸载走主进程 `src/main/marketplace-catalog.js` / `marketplace-install.js`。
- 本目录**不再**被预置安装（`ensureDshMarketPlugin` 已移除，启动只做残留清理
  `removeDshMarketPreset`），**不再**进入打包 `extraResources`，`node_modules` 已从
  仓库移除。
- `dshmarket` 已列入桌面 `DROPPED`：Loader 不再挂载它（含用户此前自装的副本），
  避免出现第二个 `market` 分区；磁盘文件不删除。
- 上游 LICENSE（MIT）保留于本目录；若把此处代码复制进桌面自有模块，须保留其
  版权声明。

尚未移植的上游能力（主题商店、备份 / Gist、诊断、热更新、多源）见
[docs/features/marketplace-settings.md](../../docs/features/marketplace-settings.md) 的 deferred 清单。
