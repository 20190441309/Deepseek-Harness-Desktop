## 0.2.1

当前请用这一版。[v0.2.0](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases) 因启动失败已撤回，不要再装 0.2.0。

### 安装包

- Windows x64：`Deepseek-Harness-Desktop-Setup-0.2.1.exe`
- macOS Apple Silicon（arm64）：`Deepseek-Harness-Desktop-0.2.1-mac-arm64.dmg`（未签名：下载后右键 → 打开；或执行 `xattr -cr /Applications/Deepseek-Harness-Desktop.app`）
- Intel Mac 与 Linux 仍请从源码运行

### 相对 0.1.3 的新能力

- 设置 → MCP、设置 → 技能
- 标题栏 Git、完整 VT 终端、右边栏 Files / Diff / Browser / Agents
- 最新用户消息可编辑后重新发送
- Harness 意外退出后自动回到故障页并有限次重启
- 关闭窗口时可最小化到托盘或直接退出
- 插件市场安装改为打开空白会话并预填草稿

### 相对撤回的 0.2.0 的修复

- 官方 Web UI 起来后，标题栏除最小化 / 最大化 / 关闭外点不了
- 单个 MCP 子进程失败不再拖垮整个 Host
- 打包时检查 MCP / 技能运行时产物是否齐全

手机远程办公入口本版仍隐藏。
