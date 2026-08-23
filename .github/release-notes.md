## 0.2.7

相对 0.2.6：Harness 钉到 `0.1.1-rc.1`，桌面家目录与官方 `~/.dsh` 隔离，终端 Ghostty 资源打进安装包，识图不再把第三方网关误写成官方 `DEEPSEEK_*`。

### 安装包

- Windows x64：`Deepseek-Harness-Desktop-Setup-0.2.7.exe`
- macOS Apple Silicon（arm64）：`Deepseek-Harness-Desktop-0.2.7-mac-arm64.dmg`（未签名：下载后右键 → 打开；或执行 `xattr -cr /Applications/Deepseek-Harness-Desktop.app`）
- Intel Mac 与 Linux 仍请从源码运行

### 相对 0.2.6 的修复

- Harness 钉 `dsh-v0.1.1-rc.1`（`528c682e…`）。SQLite 会话库与 rc.7 不兼容；请用新会话，不要拿旧 rc 库硬开。
- 桌面 `$DSH_HOME` 只在应用 `userData/dsh-home`，安装后不读、不迁、不改官方 `~/.dsh`。
- 自定义网关（如 Ayase）不再被写成 `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL`。主模型不识图时，识图走官方兜底，需要官方 key；缺 key 报缺凭证，不再报「模型不存在 UNKNOWN」。
- Files 正在列出目录时不再闪「此目录为空」。Wallhaven 网络失败/超时有可读文案。
- 构建会把 Ghostty wasm/字体放到客户端 `assets`；源码启动缺资源则拒绝启动；安装包 `afterPack` 缺文件则失败。已安装但不完整的 `runtime/<version>` 会在下次启动时重新解压。
- 侧栏不再出现「远程」/手机入口，网关不监听。预置机器人插件启动时卸掉，侧栏无机器人入口。
- 设置里的值选择改为官方胶囊 + 菜单。
- 修复 CI 打 Windows 包：`@electron/get` 钉到可下载 NSIS 的版本；嵌套 harness `build:web` 能找到桌面的 pnpm。

0.2.4 / 0.2.5 缺市场运行时依赖，不要再装。终端若仍见 `Unable to load libghostty-vt (404)`，请改装 0.2.7。

## 0.2.6

当前 GitHub 上仍可下载的旧安装包是 0.2.6。若终端页出现 `Unable to load libghostty-vt (404)`，请改装 0.2.7。

0.2.4 与 0.2.5 的安装包里，预置插件市场的运行时依赖不完整，部分用户一打开就是 `dsh 进程结束（code 1）`（缺 `undici`，或缺 `js-yaml` 的 ESM 入口）。请改装 0.2.7。不要再装 0.2.4 / 0.2.5。

[v0.2.0](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases) 因启动失败已撤回。v0.2.1 与 v0.2.2 从未发出安装包。

### 安装包

- Windows x64：`Deepseek-Harness-Desktop-Setup-0.2.6.exe`
- macOS Apple Silicon（arm64）：`Deepseek-Harness-Desktop-0.2.6-mac-arm64.dmg`（未签名：下载后右键 → 打开；或执行 `xattr -cr /Applications/Deepseek-Harness-Desktop.app`）
- Intel Mac 与 Linux 仍请从源码运行

### 相对 0.2.5 的修复

- 打包不再把 Git 里残缺的 `node_modules` 当真相：安装包里的 `dshmarket` 在打包时用 npm 补齐运行时依赖（`undici`、`js-yaml` 及其入口文件）
- 门禁检查依赖的真实 `exports` / `module` / `main` 文件，缺 `js-yaml.mjs` 这类入口则构建失败
- 这些依赖若仍缺失，桌面不会把残缺市场插件写进 profile，Harness 还能启动（设置里暂时没有市场）

0.2.3 / 0.2.4 的功能说明仍适用：内置插件市场、壁纸图库、用户插件树恢复、终端与 Files 工作循环、浏览器预览。已发布的 0.2.6 安装包当时钉的是更早的 harness；不要把它说成 `0.1.1-rc.1`。
