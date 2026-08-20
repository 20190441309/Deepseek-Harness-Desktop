## 0.2.5

当前请用这一版。0.2.4 安装包里预置的插件市场缺运行时依赖，部分用户一打开就是 `dsh 进程结束（code 1）`。请改装 0.2.5。

[v0.2.0](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases) 因启动失败已撤回，不要再装。v0.2.1 与 v0.2.2 从未发出安装包。

### 安装包

- Windows x64：`Deepseek-Harness-Desktop-Setup-0.2.5.exe`
- macOS Apple Silicon（arm64）：`Deepseek-Harness-Desktop-0.2.5-mac-arm64.dmg`（未签名：下载后右键 → 打开；或执行 `xattr -cr /Applications/Deepseek-Harness-Desktop.app`）
- Intel Mac 与 Linux 仍请从源码运行

### 相对 0.2.4 的修复

- 安装包带上预置 `dshmarket` 的运行时依赖（`undici`、`js-yaml`），插件市场可以离线装进 web profile
- 这些依赖若仍缺失，桌面不再把残缺市场插件写进 profile，Harness 还能启动（设置里暂时没有市场）
- 打包结束时若安装包里的 `dshmarket` 仍缺已声明依赖，构建直接失败

0.2.4 的功能说明仍适用：内置插件市场、壁纸图库、用户插件树恢复、终端与 Files 工作循环、浏览器预览。内置 Harness 仍钉在 `0.1.0-rc.7`。
