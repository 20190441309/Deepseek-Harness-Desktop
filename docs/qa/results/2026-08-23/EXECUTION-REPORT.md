# 生产验收执行报告 · 2026-08-23（CI windows 安装包）

对象是 GitHub Actions `release.yml` **windows** artifact，不是源码 `qa:*`，不是本机 `npm run dist`。

**结论：不可交付。** 附录 A 五轮在旧 SHA `adf7e556…` 包上全过。修复后 CI 包 SHA `00a7f3b9e0`（§8）已实机：Files 首次打开列出 ChisaTerminal、识图不再报「模型不存在 UNKNOWN」，改为官方路由 **`MISSING_CREDENTIAL`**（本机无官方 key，TC-MODEL-005 仍无图描述）。TERM-002 / CHAT-008 未改 UX，未复测。托盘仍 Blocked。未勾「Release 将上传同一 SHA」。

执行人：Trent / Cursor Grok 4.6 · 日期：2026-08-23

---

## 0. 产物

| 项 | 值 |
| --- | --- |
| Actions run | https://github.com/ChisaAlter/Deepseek-Harness-Desktop/actions/runs/32612504239 |
| git SHA | `adf7e5561b92c908326efcece4e3ea58ee568479` |
| Artifact | `DeepSeek-Harness-windows-x64` |
| 安装包 | `Deepseek-Harness-Desktop-Setup-0.2.6.exe`（468917439 B） |
| SHA256 | `5AED64D7F2E834636D398B6174BCD00E02568B2D919B436EC10353D6EBF4BE73` |
| 安装目录 | `%LOCALAPPDATA%\Programs\Deepseek-Harness-Desktop\` |
| 家目录 | `%APPDATA%\Deepseek-Harness-Desktop`（真实 userData，无 `--user-data-dir`） |
| About | 桌面 `0.2.6` |
| 包内 harness pin | stamp `runtime/0.2.6/.dshd-runtime.json`：sha `528c682e…` / npm `0.1.1-rc.1`（`dsh-v0.1.1-rc.1`） |
| bundled `resources\node.exe` | **v22.23.2** |
| OS | Windows 10.0.26200 x64 |
| 模型 | Settings 自定义提供方 `ayase` / `grok-4.6` / `https://ayase.cn/v1`（密钥未入本报告） |
| TC-WS-006 仓 | `C:\Ai\ChisaTerminal`（`workspace.json` 已登记；启动 Documents 仓为空目录） |

先前 `workflow_dispatch` 失败 run `32612148661`（setup-harness 找不到 pnpm）**作废**，不使用其包。

---

## 1. 本轮证明的修复

先前源码绿、安装包红的点，在**该 CI SHA** 上已实机看到：

- 同版本 overlay 后 stamp 存在；冷启动无 `unknown option '--no-open'`；Ghostty wasm HTTP **200**。
- 侧栏打开 `ChisaTerminal` 后 Git 分支菜单为 `master` / `111`；`window.shell.gitBranchList('C:\\Ai\\ChisaTerminal')` 成功。
- 底栏终端提示符 `PS C:\Ai\ChisaTerminal>`，`echo dshd-qa-ok` 有输出；附录第 4 轮工具贴出 `C:\Ai\ChisaTerminal`。
- 侧栏底部无「远程」/手机图标；3180 无监听；`window.shell.getRemote` 不存在。

---

## 2. P0 Fail / Blocked（发版门禁）

| ID | 结果 | 说明 |
| --- | --- | --- |
| TC-MODEL-005 | **Fail** | 识图模型已设 DeepSeek-V4-Flash-Vision-Exp。向 grok-4.6 会话粘贴图片后发送，对话出现 **「本轮运行失败 模型不存在 UNKNOWN」**，不是发送前拒绝，也没有图描述。 |
| TC-TERM-002 | **Fail** | 终端有输出，未见「选区 / Add to chat / 加入对话」控件，未把 terminal fence 送进 Composer。 |
| TC-CHAT-008 | **Fail** | Files 预览 README 有渲染/保存，未见带行范围的「加入对话」。 |
| TC-DESK-002 | **Blocked** | 关窗进托盘后进程仍在、3080 仍 200、快捷方式能恢复窗口。Win11 托盘溢出里的五项右键菜单未逐项点到。 |
| TC-DESK-004 | **Blocked** | 未点托盘「退出」。本轮以「关闭行为=直接退出」后进程归零覆盖退出路径。 |
| TC-INST-004 / 005 / 006 / 011 | **Blocked** | 造障（坏插件 / 官方 `~/.dsh` 坏 bundle / 导出失败日志）本轮未做。 |
| TC-APP-008 | **Pass*** | Wallhaven 分类仅「常规 / 动漫 / 人物」，无 R18。缩略图 `fetch failed`（与本机 Wallhaven 超时史一致）。用 Bing 完成设壁纸。 |

没有书面豁免单。按 §0.3：**不可交付**。

---

## 3. 附录 A（安装包会话 · ChisaTerminal）

同一会话、`grok-4.6` High：

| 轮 | 结果 | 摘录（无密钥） |
| --- | --- | --- |
| 1 连通+验证码 | Pass | 「你已连通，验证码是 **456**。」 |
| 2 记忆 | Pass | `456` |
| 3 读 README | Pass | 工具卡；三句总结 Electron 终端模拟器 / xterm / PowerShell Hook |
| 4 终端目录名 | Pass | 工具卡；`C:\Ai\ChisaTerminal` |
| 5 汇总 | Pass | 含 `456` 与 `C:\Ai\ChisaTerminal`（产品句偏复述用户题，目录与验证码可核对） |

截图：`appendix-turn1.png` … `appendix-turn5.png`。

额外：编辑最近用户消息重发 → 回复「已改写」（TC-CHAT-009）。只读会话申请写入：用户答「拒绝。不要写入。」后模型未创建 `dshd-reject-probe.txt`（TC-APPROVE-002）。用户答「批准」后模型声称已写 `dshd-allow-probe.txt`，磁盘上**没有**该文件；随后强制写工具得到 `sandbox: file access denied under read-only mode`，**未出现「允许一次」**。可写会话里附录读文件/Pwsh 工具卡自行完成（TC-APPROVE-001 按可写预设放行记 Pass）。

---

## 4. 其它实机要点

- **Git 提交**：提交对话框只勾 `dshd-qa-2026-08-23.txt`，说明 `qa: dshd production walk note`，HEAD `cb648d5`，未 push。用户其它改动仍在工作区。
- **Composer**：`/` 为官方命令菜单；`$fo` 无 `foo-skill`；`@` 为工作区路径（ChisaTerminal 目录），无桌面 path source；无 `sessions without inject`。
- **Files**：首次打开偶发「此目录为空」，刷新后列出 ChisaTerminal；搜索 README；预览；「引用到输入框」写入 `[.cnb.yml](.cnb.yml)`。
- **Browser**：`window.shell.previewOpen({ url: 'https://example.com' })` 成功，CDP 出现 Example Domain。
- **壁纸**：Bing 收藏 → 确认设壁纸 → 裁切；本地 1×1 PNG 同样进入裁切；Appearance 仅挑选/浏览/毛玻璃/像素化。
- **市场**：设置内 `market` 分区，约 1884 项；已安装为空（无 dshbot 行）；无独立市场窗。
- **崩溃恢复**：结束 `dshd-web.pid` 子进程后启动页「第 1/3 次自动重启已完成」，随后 3080/wasm 再 200，会话列表仍在。
- **关闭**：进托盘时无标题窗、进程与 3080 仍在；开始菜单快捷方式恢复。之后关窗退出，进程 0、3080 关闭。已把 `config.json` 的 `closeToTray` 写回 `true`。

非法证据未用于 Pass：`qa:source` / `qa:composer` / `qa:packaged` / 本机 dist。

---

## 5. 截图索引（`docs/qa/results/2026-08-23/`）

`ws006-chisa-sidebar.png`，`git-branch-menu.png`，`settings-about.png`，`settings-ayase.png`，`settings-market.png`，`settings-appearance.png`，`gallery.png`，`gallery-wallhaven*.png`，`gallery-confirm-wallpaper.png`，`gallery-crop.png`，`terminal-echo.png`，`files-search-readme.png`，`files-readme-preview.png`，`appendix-turn1.png`–`turn5.png`，`appendix-edit.png`，`approve-reject.png`，`approve-allow.png`，`vision.png`，`harness-crash.png`，`git-commit-dialog.png`。源码复测：`files-chrome-panel.png`，`vision-source-retest.png`。修复后 CI 包：`vision-ci-packaged.png`。

---

## 6. 发版前还要做的

代码侧（本树，非该 SHA 安装包）已落地：`spawnEnv` 不再把 Ayase 写成 `DEEPSEEK_*`；Files pending 不画空目录；Wallhaven 解包 `fetch failed`；识图 `finishError` 抛 `LlmError`；TERM-002 / CHAT-008 / APPROVE-001 / 托盘步骤已改合同。

仍须在 **SHA `00a7f3b9e0` 包**（或其后继 CI exe）上收口：

1. TC-MODEL-005：配官方 `DEEPSEEK_API_KEY`（或 Ayase 真图模态）后再贴图，要图描述才 Pass。§8 已证明不再走「模型不存在 UNKNOWN」。  
2. TC-SURF-001：§8 首次打开已列出 ChisaTerminal；若还需 pending 文案一帧，可人工放慢盘再看。  
3. TC-TERM-002 / TC-CHAT-008 按改后步骤（Ghostty 拖选右下角「加入对话」；预览源码拖行「添加到对话」）。未改「打开就能点」的 UX。  
4. 托盘五项 + 托盘退出：按 DESK-002/004 人手展开 Win11 溢出；点不到记 Blocked 不挡产品。  
5. 造障条 INST-004/005/006/011 能造则测，否则豁免。  
6. 产品负责人勾 §16「Release 将上传同一 SHA」后再 `gh release` **新 exe**（不得上传本报告第 0 节那份旧包冒充已修）。

附录 A 五轮不必重跑，除非改了主模型路径。

---

## 7. 本轮代码复测（非安装包 Pass）

对实现做了单测 / client spec，**不能**把下列结果写入生产表 Pass：

- Desktop `node --test src/shared/official-deepseek-env.test.js src/main/dsh.test.js src/main/wallpaper-catalog.test.js`：**53 pass / 0 fail**（含 Ayase 不得写入 `DEEPSEEK_BASE_URL`、官方 host 仍写入、`fetch failed`→网络失败、AbortError→超时）。  
- Harness `pnpm exec vitest run packages/client/ui-files/tests/files-panel.client.spec.tsx packages/llm/llm-vision-fallback/tests/finish-error.spec.ts`：**63 pass / 0 fail**（pending `listDir` 不画 empty.dir；`finishError` 为 `LlmError`）。

源码 Electron（`node scripts/run-electron.js`，真实 `%APPDATA%\Deepseek-Harness-Desktop`，bundled ui-files / vision-fallback lib 已重建）对 `http://127.0.0.1:3080/` 的实机核对（外置 Chrome，**不是** CI 安装包）：

- **Files pending：** 首次点 Files，无障碍树出现 `Listing directory…`（`listing` 文案），随后因外置浏览器没有 Electron `window.shell` 落到 `Workspace listing is unavailable.`，**没有**先闪 `此目录为空` / `This directory is empty.`。截图 `files-chrome-panel.png`。ChisaTerminal 真树仍须在 Electron 窗里列。  
- **识图路由：** 可写会话粘贴 `dot.png` 后发送。不再出现走表时的「模型不存在 UNKNOWN」。本轮失败为 **`deepseek-official` 无官方 key → `MISSING_CREDENTIAL`**（Ayase 密钥未再串到 `DEEPSEEK_*`）。截图 `vision-source-retest.png`。TC-MODEL-005 仍未 Pass：需要官方 `DEEPSEEK_API_KEY`（或 Ayase 上真有图模态的模型）才能出图描述。  
- TERM-002 / CHAT-008 **未改产品 UX**，无新的终端/预览选区产品复测。

完整 CI 安装包复测见 **§8**（SHA `00a7f3b9e0`）。

---

## 8. 修复后 CI windows 包（SHA `00a7f3b9e0`）

对象是 `workflow_dispatch` [run 32618594546](https://github.com/ChisaAlter/Deepseek-Harness-Desktop/actions/runs/32618594546) 的 windows artifact，commit `feature(dsh-home): do not alias third-party gateways onto DEEPSEEK_*`。`/S` 覆盖安装到 `%LOCALAPPDATA%\Programs\Deepseek-Harness-Desktop\`，bundled `node.exe` **v22.23.2**。未用本机 `dist\`。

| 项 | 值 |
| --- | --- |
| git SHA | `00a7f3b9e034917533268d4866c2999c0927ac5b` |
| Artifact | `DeepSeek-Harness-windows-x64` |
| 安装包 | `Deepseek-Harness-Desktop-Setup-0.2.6.exe`（468645077 B） |
| SHA256 | `92DE1DBFDC1B68FAE6B48C84BDCC9AD6381924A79E26531C18733EEE1964100C` |
| overlay stamp | `runtime/0.2.6/.dshd-runtime.json`：upstream sha `528c682e…` / npm `0.1.1-rc.1`；`ui-files` 含「正在列出目录…」，`llm-vision-fallback` 含 `finishError` / `LlmError` |

实机（已装 exe + Electron CDP，`window.shell` 为真，ChisaTerminal）：

- **Files：** 首次打开 `[data-files-panel]` 直接列出 `.cnb` / `.github` / `docs` 等，**没有**「此目录为空」或 `Workspace listing is unavailable.`。listDir 本地很快，未抓到 pending 文案一帧；空目录闪现这条在该包上未再现。
- **识图：** 新会话粘贴 `dot.png`、发送「描述这张图」。失败为 **`本轮运行失败` + `deepseek-official` 无 key + `MISSING_CREDENTIAL`**。**没有**「模型不存在 UNKNOWN」。截图 `vision-ci-packaged.png`。TC-MODEL-005 仍 Fail：要官方 `DEEPSEEK_API_KEY`（或 Ayase 上真有图模态的模型）才会出图描述。
- TERM-002 / CHAT-008 本包未再走选区。

此 SHA 的 Setup **可以**作为拟发布文件候选；在官方识图 key 配好并过 TC-MODEL-005、以及 TERM/CHAT 按改后步骤测完之前，仍不可交付。
