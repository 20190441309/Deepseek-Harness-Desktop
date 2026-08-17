## 0.2.3

当前请用这一版。[v0.2.0](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases) 因启动失败已撤回，不要再装。v0.2.1 与 v0.2.2 从未发出安装包。

### 安装包

- Windows x64：`Deepseek-Harness-Desktop-Setup-0.2.3.exe`
- macOS Apple Silicon（arm64）：`Deepseek-Harness-Desktop-0.2.3-mac-arm64.dmg`（未签名：下载后右键 → 打开；或执行 `xattr -cr /Applications/Deepseek-Harness-Desktop.app`）
- Intel Mac 与 Linux 仍请从源码运行

### 相对 0.1.3 的新能力

- 设置 → MCP、设置 → 技能
- 标题栏 Git、完整 VT 终端、右边栏 Files / Diff / Browser / Agents
- 最新用户消息可编辑后重新发送
- Harness 意外退出后自动回到故障页并有限次重启
- 关闭窗口时可最小化到托盘或直接退出
- 插件市场安装改为打开空白会话并预填草稿

### 本版修复

- 编辑第一条消息或空白 fork：会话标题跟新提示走，不再钉成「父标题 (1)」
- 标题栏变窄时折叠 Git / 会话文案，减轻拥挤
- 终端抽屉首次打开能正确适应尺寸并聚焦
- 重复注入桌面安装插件导致 Harness 起不来
- 桌面 IPC 校验调用来源、下载文件名净化、配置字段白名单、插件安装只接受 `github:owner/repo`
- macOS 工作区路径按 realpath 归一，桌面单测不再因 `/var` 符号链接整批失败（这是 v0.2.1 发不出去的原因）
- 桌面单测不再依赖已安装的 vendor，并兼容 macOS realpath、文件系统 Git remote 与进程停止时序
- 发布任务只构建和上传安装包；双平台单测与 vendor GUI 留在日常 CI，移除依赖虚拟屏幕和合成鼠标的误报门禁
- Windows 构建成功即可发版；macOS 失败不再吞掉 Windows 安装包；tag 必须与 `package.json` 一致

手机远程办公入口本版仍隐藏。
