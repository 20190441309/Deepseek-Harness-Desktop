## 0.2.4

当前请用这一版。[v0.2.0](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases) 因启动失败已撤回，不要再装。v0.2.1 与 v0.2.2 从未发出安装包。

### 安装包

- Windows x64：`Deepseek-Harness-Desktop-Setup-0.2.4.exe`
- macOS Apple Silicon（arm64）：`Deepseek-Harness-Desktop-0.2.4-mac-arm64.dmg`（未签名：下载后右键 → 打开；或执行 `xattr -cr /Applications/Deepseek-Harness-Desktop.app`）
- Intel Mac 与 Linux 仍请从源码运行

### 相对 0.2.3 的新能力

- 插件市场改为随应用内置的 `dshmarket`，没有独立市场窗口，也不再往对话预填安装草稿
- 外观「浏览」打开壁纸图库窗口：分类、搜索、收藏、确认后按窗口比例裁切
- 手机远程改用独立 Web 客户端（扫码配对）；中继必须是 HTTPS
- 用户插件树把 Harness 起挂时，启动页可跳过用户插件恢复
- 终端：ghostty VT、Windows ConPTY 兼容、Pierre 调色板、斜杠命令跟随
- 右边栏 Files 工作循环（搜索 / 保存 / 跳转）接到官方逻辑
- 浏览器预览：画中画、缩放、设备工具栏与录制
- 审批面板与输入框可以拉开高度；标题栏拥挤时继续折叠
- 内置 Harness 钉在 `0.1.0-rc.7`

### 本版修复

- macOS 工作区路径按 realpath 比较，编辑器单测不再因 `/var` → `/private/var` 失败
- macOS 画中画窗口 `alwaysOnTop` 级别与实现一致（`floating`）
- 官方 client 类型检查通过，安装包 CI 能跑完 `pnpm run build`
- 根目录 `.gitignore` 不再误忽略 `vendor/deepseek-harness/scripts/release/`
- Windows 构建成功即可发版；tag 必须与 `package.json` 一致
