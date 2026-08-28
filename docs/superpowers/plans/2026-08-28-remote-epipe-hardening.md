# 远程 EPIPE 止血与守护进程收敛 — 执行计划

Date: 2026-08-28

Feature: `remote-settings`（涉及 [mobile-remote](../../features/mobile-remote.md) 的提供方就绪面）

Work branch: `cursor/remote-epipe-hardening-2f82`

## 背景（已复核的根因）

1. **P0 EPIPE 崩溃**：开启远程 → 主进程内联跑 `createChisaCodeDaemon` → 手机端首个请求触发 `DshAgentClient` 懒构造 → `resolveDshVendorDir()` 调 `execSync("npm root -g")` **未传 `stdio`**。Node 对无 `stdio` 的 `execSync` 会把子进程 stderr 用 `process.stderr.write()` 转写回父进程；桌面 GUI 的 stderr 常是已断开的管道（安装器/启动器父进程已退出），这笔写入以 uncaughtException `EPIPE: broken pipe, write` 打爆 Electron 主进程。函数体内的 `try/catch` 拦不住——写入发生在 `execSync` 返回之后、Node 内部。已用最小复现脚本确认（栈与用户截图一致）。
2. **崩溃时序造成「默认开启」假象**：`shell:save-remote` 先 `saveConfig({remoteEnabled:true})` 再 `sync()`；崩溃后重启读到 `remoteEnabled:true`，引导期 `sync()` 再次尝试拉起 daemon。`config.js` 默认值本身是 `false`。
3. **P0 架构**：上游 chisacode desktop 用 `packages/desktop/src/daemon/daemon-manager.ts` 把 daemon 放**独立子进程**（显式 pipe stdio、崩溃只死子进程）；本仓库把 daemon 塞进 Electron 主进程，daemon 侧任何未捕获错误都威胁整个应用。
4. **P1 失败不可见**：引导期 `beginRuntimeRecovery` 的 `Promise.allSettled([remote.sync(), …])` 吞掉启动失败（连日志都没有）；弹窗里「开启」按钮在 `enabled=true` 时是 no-op，启动失败后用户无法重试，只看到「还没有可扫描的配对二维码」。
5. **P1 未接通桌面 Harness**：`CHISACODE_DSH_VENDOR_DIR` 未设置 → dsh provider 反复探测 npm 全局安装（每次都是一笔 `execSync`），桌面自带的 harness 插件树从未被利用。
6. **P2 stop 断线**：`HarnessController.shutdown()` 调 `this.remote?.stop?.()`，而 `ChisaCodeRemote` 只有 `stopDaemon()` —— 可选链让它静默 no-op，退出时 daemon / mobile-web server 泄漏。

## 分阶段

### 阶段 1（本轮交付）— 止血 + 接线 + 可见性 + 收敛

1. **vendor 修复（根因）**：`dsh-agent.ts` 的 `execSync("npm root -g", …)` 增加显式 `stdio: ["ignore", "pipe", "pipe"]`。Node 只在 `options.stdio` 缺省时才转写 stderr（`inheritStderr = !options.stdio`），显式给出后转写路径整体消失。同时导出 `DSH_VENDOR_PACKAGES` 供桌面侧复用（见 4）。`prepare-chisacode-remote.mjs` 按 mtime 重建 dist，改动会随下次启动/打包生效。
2. **主进程 stdio 防线（纵深）**：新增 `src/main/stdio-guard.js`：
   - `installStdioGuard()`：给 `process.stdout` / `process.stderr` 挂 `error` 监听，吞掉断管类错误（EPIPE / EIO / EBADF / ERR_STREAM_DESTROYED）——日志 fd 断了永远不该杀 GUI 应用；其他流错误记入 dsh 日志。
   - `installUncaughtBrokenPipeGuard()`：`uncaughtException` 中仅对「写系统调用 + 断管类 code」放行返回（覆盖 in-process daemon 里向已死子进程 stdin 写入等 Electron 主进程护不住的场景），其余错误复刻 Electron 默认行为（错误框 + 继续运行）并记日志，不改变非 EPIPE 的可见性。
   - `index.js` 尽早安装（在 ChisaCodeRemote 构造前）。
3. **失败可见 / 可重试**：
   - `HarnessController` 引导期 remote sync 失败改为记日志（与 596 行 runtime 路径同款文案），不再被 `allSettled` 无声吞掉；`snapshot().error` 本就会带给弹窗。
   - `RemoteSection`：`enabled && !listening` 时「开启」按钮允许重试（再次 `save({remoteEnabled:true})` → `sync()` 重启 daemon）；提示语从泛泛的 `noQr` 换成明确的 `notListening`（zh/en 双语新 key）。
4. **桌面 harness 收敛（第一步）**：`ChisaCodeRemote.startDaemon` 在创建 daemon 前，若用户未自设 `CHISACODE_DSH_VENDOR_DIR`，探测 `harnessRoot()/node_modules/@deepseek-ai` 是否含全部 `DSH_VENDOR_PACKAGES`（且各自 `lib/index.js` 已构建），完整则设置该环境变量。效果：
   - 桌面自带 harness 构建完成时，dsh provider 直接用桌面插件树（不再依赖 npm 全局安装）；
   - 环境变量一旦设置，`resolveDshVendorDir` 走 override 分支，**桌面上不再发生 `npm root -g` 的 `execSync`**（EPIPE 向量在桌面侧二次消除）；
   - 不完整时不设置，保留 npm 全局回退（已被 1 修安全），不回归已有全局安装用户。
5. **stop 接线**：`shutdown()` 改调 `stopDaemon()`；测试 fixture 同步。
6. **回归测试**：
   - `src/main/stdio-guard.test.js`：断管吞掉 / 非断管透传 / uncaught 分类。
   - `src/main/remote-epipe.test.js`：(a) 源码 tripwire——vendored `dsh-agent.ts` 的 execSync 必须带显式 stdio；(b) 行为测试（dist 存在时）——真实 broken-stderr 子进程内跑 `resolveDshVendorDir`，断言不再 uncaught（dist 缺失时 skip，CI 不依赖 vendor 构建产物）。
   - `chisacode-remote.test.js`：vendor-dir 探测（完整→设 env、不完整→不设、用户已设→不动）。
   - `harness-controller.test.js`：shutdown 调 `stopDaemon`。
   - `remote-section.client.spec.tsx`：enabled+未监听 → 开启按钮重试、`notListening` 提示。

### 阶段 2（后续轮）— daemon 子进程隔离（对齐上游架构）

把 `createChisaCodeDaemon` 迁出主进程，对齐上游 `daemon-manager.ts`：

1. 新增 daemon 入口脚本（vendored server dist 直接可用），用 `ELECTRON_RUN_AS_NODE=1` + `utilityProcess.fork` 或 `child_process.spawn(process.execPath)` 拉起，stdio 全显式 pipe，日志接入 dsh 日志。
2. `ChisaCodeRemote` 改为进程管理面：健康探测（上游用 `/health` + pid lock）、退出重启退避、`stopDaemon` 发 SIGTERM + 超时 SIGKILL。
3. 快照/配对改走 daemon HTTP/WS 面（上游即如此），删除 in-process 的 logger 探针 hack（`attachRelayStatusProbe`）。
4. 风险：Windows 打包环境的 spawn 兼容（`.cmd` shell 引号规则见 launcher 卡）、utilityProcess 与 sandbox 的交互、mobile-web server 归属（留主进程或随子进程）。需要真机 QA，不与本轮混合交付。

### 阶段 3（后续轮）— dsh provider 全量接通

1. `CHISACODE_HOME` 收敛进 `userData`（需解决 env 泄漏到 PTY 子进程的问题，参照 dsh-home 规则的 overwrite 策略，或 fork 掉 `resolveManagedDshHome` 的 env 依赖）。
2. `dsh-acp-demo` 启动路径：桌面无全局安装时用 `agentProviderSettings.dsh.command`（replace argv）指向桌面可执行入口；密钥沿用 shell `DEEPSEEK_API_KEY` 通道（dsh-home 卡的 https 白名单规则）。
3. 手机端 provider 就绪矩阵与 mobile-remote 卡 gates 对齐。

## 回滚

- 阶段 1 全部为加法/局部修复：revert 单个 commit 即可回滚对应行为；`CHISACODE_DSH_VENDOR_DIR` 探测不完整时零行为变化。
- vendor dist 由 prepare 脚本按 mtime 重建，revert 源码后下次启动自动回到旧产物。

## Gates

| Kind | What |
| --- | --- |
| Automated | `npm test`（含新增 stdio-guard / remote-epipe / chisacode-remote / harness-controller 用例）；`remote-section.client.spec.tsx` |
| Manual | Windows 打包机：开启远程（stderr 断管场景）不崩；开启失败 → 弹窗错误 + 「开启」重试；退出应用 daemon/3180 端口释放 |
