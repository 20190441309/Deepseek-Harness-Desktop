# DeepSeek Harness GUI

Electron 桌面端，**集成官方 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 源码**（不是只套一层 `npx dsh web`）。

源码在 `vendor/deepseek-harness`。聊天、工具、审批、Web UI 都来自这份仓库；本目录负责窗口、托盘、启动/停止，以及工作区与 API Key。

## 要求

- Windows 10+
- [Node.js](https://nodejs.org/) **22.19+ 或 24+**
- [pnpm](https://pnpm.io/) 11（官方仓库锁定 `pnpm@11.7.0`）
- 本机已有 Electron（`npm start` 会复用，不重新下载）
- DeepSeek API Key

## 第一次

```powershell
cd C:\ai\deepseek-harness-gui
npm run setup:harness
npm start
```

`setup:harness` 会 clone 官方仓库（若还没有）、在 `vendor/deepseek-harness` 里 `pnpm install` 并 `pnpm run build`。之后 Electron 用构建出的 `apps/cli/lib/bin.js web` 启动，默认 `http://127.0.0.1:3080`。

工作区仍是 Electron 设置里的目录（默认本仓库）。启动时会检测端口：已被占用则询问接入已有服务或换用空闲端口。

## 日常

```powershell
npm start
```

改官方 Web UI / 插件：编辑 `vendor/deepseek-harness`，再在该目录执行 `pnpm run build`（或 `pnpm run build:web`），然后重启桌面端。

## 使用

- `Ctrl+,` 打开设置：工作区、端口、API Key、主题。
- **文件 → 打开工作区** 会切换目录并重启 harness。
- 关闭窗口默认最小化到托盘。

API Key 会作为 `DEEPSEEK_API_KEY` 传给 `dsh`。也可以只在 Web UI 的 **设置 → 模型** 里填写。

## 结构

- `vendor/deepseek-harness`：官方源码（clone）
- `src/main`：Electron 主进程，从源码启动 `dsh web`
- `src/preload` / `src/renderer`：启动页、设置页、窗口按钮
