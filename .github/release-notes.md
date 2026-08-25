## Deepseek-Harness-Desktop 0.2.7

相对 [0.2.6](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/releases/tag/v0.2.6)：新增**冷启动启动器**与官方数据导入，桌面家目录与官方 `~/.dsh` 隔离，Harness 钉到 `0.1.1-rc.1`，终端 Ghostty 资源打进安装包，识图不再误写第三方网关凭证。

### 升级注意（必读）

> [!CAUTION]
> **升级后不会自动带上旧对话，侧栏可能是空的。**
>
> 0.2.7 起桌面只用自己的 `dsh-home`，不读、不迁官方 `~/.dsh`。请先**完全退出**应用（托盘也要退）。
>
> **推荐做法：** 冷启动进入 **启动器 → 导入**，按勾选项拷进桌面家目录。不要拷 `profiles`。旧 rc 的 SQLite 会话库与本版不兼容，不要硬开。

启动器不可用时，可用下面的手动拷贝兜底（拷完后打开**当时聊天用的工作区路径**；未绑定工作区的对话在「无工作区」）：

**Windows（PowerShell）**

```powershell
$old = "$env:USERPROFILE\.dsh"
$new = "$env:APPDATA\Deepseek-Harness-Desktop\dsh-home"
Copy-Item "$old\sessions\*" "$new\sessions\" -Recurse -Force
if (Test-Path "$old\attachments") {
  Copy-Item "$old\attachments\*" "$new\attachments\" -Recurse -Force
}
```

**macOS：** 把 `$HOME/.dsh/sessions` 拷到 `~/Library/Application Support/Deepseek-Harness-Desktop/dsh-home/sessions`（`attachments` 同理）。

### 安装包

| 平台 | 文件 |
| --- | --- |
| Windows x64 | `Deepseek-Harness-Desktop-Setup-0.2.7.exe` |
| macOS Apple Silicon（arm64） | `Deepseek-Harness-Desktop-0.2.7-mac-arm64.dmg` |

- macOS 包**未签名**：下载后右键 → 打开；或执行 `xattr -cr /Applications/Deepseek-Harness-Desktop.app`
- Intel Mac 与 Linux 请从源码运行
- 校验：同页的 `SHA512SUMS.txt`（Setup / blockmap / DMG）

若终端仍见 `Unable to load libghostty-vt (404)`，或装过 0.2.4 / 0.2.5（市场依赖不完整），请改装本版。

### 本版变化

**启动与导入**

- 冷启动先开**启动器**（同一安装包、同一进程），再按需启动桌面端
- 有新正式版时询问；空桌面且官方 home 有可导入数据时停在**导入页**
- 启动失败时留在启动器，用 **Recovery Board** 排查插件
- 版本页可查看本机安装、更新 / 卸载 Setup
- 「关闭桌面端」只停内核并关主窗，不退出应用
- 桌面「通用设置 → 启动时」与启动器「打开后自动启动桌面端」共用同一开关

**数据与模型**

- 桌面 `$DSH_HOME` 仅在应用 `userData/dsh-home`，不碰官方 `~/.dsh`
- Harness 钉 `dsh-v0.1.1-rc.1`（与更早 rc 的 SQLite 会话库不兼容）
- 自定义网关不再被写成官方 `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL`
- 主模型不识图时走官方识图兜底（需官方 key）；缺 key 报缺凭证，不再报「模型不存在 UNKNOWN」

**界面与终端**

- Files 列出目录时不再误闪「此目录为空」
- Wallhaven 网络失败 / 超时有可读提示
- Ghostty wasm / 字体打进安装包；缺资源则拒绝启动或打包失败
- 侧栏隐藏「远程」/ 手机与「机器人」入口；预置机器人插件启动时卸掉
- 设置里的值选择改为官方胶囊 + 菜单
