# 生产验收执行报告 · 2026-08-23

**结论：本报告不是安装包可交付记录，不得据此发版。**

源码 walk（`qa:source` / `qa:composer` / `qa:shell` / `qa:appendix`）曾给 TC-INST-001、TC-GIT-001、终端 P0 等打 Pass，与随后 **已安装 NSIS** 在 `%APPDATA%\…\dsh-home` 已登记兄弟仓上 Git 空菜单、终端「无法启动终端」、同版本覆盖 `unknown option '--no-open'` **冲突**。按现行 [production-acceptance-test-cases.md](../../production-acceptance-test-cases.md) §0：源码绿而安装包红 ⇒ 源码套件与本表同时失效。本机 `dist/` / `qa:packaged` 也不是 GitHub Actions windows artifact，不能填生产表 Pass。

手机扫码 / SPA 发消息（TC-REM-002）本轮跳过：产品尚未开发完成（书面豁免，不得标 Pass）。

下一次发布：下载 `release.yml` windows artifact → 对该 SHA 走完全表 → §16 勾同一 SHA → 再上传**该文件**。

Touching: 验收合同（本报告作废为发版许可）。TC-REM-002 不得标 Pass。

执行人：Trent / Cursor Grok 4.6 · 日期：2026-08-23

---

## 0. 环境与产物

| 项 | 值 |
| --- | --- |
| 日期 | 2026-08-23 |
| 测的是什么 | 源码 `electron .` 实机 walk + 既有 NSIS / `win-unpacked` 记录 |
| 分支 | `main` |
| HEAD | `1dbd3d6b63` `test(vendor): absorb Windows web replay fork assertions` |
| package.json | `0.2.6` |
| GitHub Release Setup | `Deepseek-Harness-Desktop-Setup-0.2.6.exe`，SHA256 `7e815e5d9f8f6f2bac6fec693db83710c61a948617a961eacc15537a17019abe`（465625163 B，2026-08-20） |
| 本机重建 Setup | `dist/Deepseek-Harness-Desktop-Setup-0.2.6.exe`，SHA256 `e893380e92ee261ead17869e617b27f282ab50633b7aa09aa9935034e4edded3`（468869302 B，2026-08-23 09:11）；此前 00:06 副本 SHA `E989B474…53283A` |
| OS | Windows 10.0.26200 x64 |
| 模型 | `grok-4.6` High（附录 A；密钥未入本报告） |
| 家目录 | 冒烟 `userData/dsh-home`；Electron `DSH_HOME` 为空；不读官方 `~/.dsh`（附录仅 **复制** settings/credentials 进隔离 home） |

Release 正文仍钉 harness **0.1.0-rc.7**。发版必须改宣传 `vendor/harness-upstream.json`（当前 `0.1.1-rc.1`）。

Wallhaven API 本机约 15s 超时（有无代理皆然）；Bing `cn.bing.com` HPImageArchive **200**。图库确认设壁纸走 Bing，不走 Wallhaven 缩略图。

---

## 1. 执行手段

| 批次 | 命令 | 结果 |
| --- | --- | --- |
| A | `npm test` | **PASS 704/704**（~97s） |
| B | `DSH_SMOKE_KEEP=1 npm run qa:source` | **PASS**（此前本会话；含 Bing 确认设壁纸、自定义提供方 `dshdqa`） |
| C | `DSH_SMOKE_KEEP=1 npm run qa:composer` | **PASS**（2026-08-23 03:10 UTC+8；`pairingSpa` 绿；`spaSend` **SKIP** 可选） |
| D | `npm run qa:shell` | **PASS**（此前本会话；快捷键 / 关到托盘 / 持久化 / skip-sticky / 杀子进程恢复） |
| E | `DSH_SMOKE_KEEP=1 npm run qa:appendix` | 五轮 **PASS**；`editUser` **PASS**；`reject` 一次 **PASS**、其后模型改走提问则 **FAIL**；`vision` **PASS**（发送前拒绝） |
| F | 双实例探针（同源 `electron.exe` + 同一 `--user-data-dir`） | **PASS**：第二进程立即退出并打印 already running |
| G | 手机扫码后在 SPA 发一条 | **跳过**（功能未完成，见 TC-REM-002 豁免，不得标 Pass） |
| H | `npm run qa:packaged`（现有 `dist/win-unpacked` 09:09 asar） | **FAIL**：asar 早于 `DSH_SMOKE_SIBLING` 接线，结果无 `packagedP0`。补全 `workspace.json` schema 后同一 asar 的 UI/PTY/`titlebarHits` 已绿；overlay 解压出 `runtime/0.2.6`。须 **再 `npm run dist` 后** 重跑 `qa:packaged` 才可能 GREEN。 |

冒烟均未向 Electron 注入 `DSH_HOME`。结果 JSON 不含配对 URL / API 密钥明文。

---

## 2. 本轮修复（walker，非产品合同）

- **图库确认设壁纸：** 等 Bing 缩略图，不再等超时的 Wallhaven。
- **自定义提供方表单：** 作用域限制在 CustomProviderCard；`insertText` 写入受控输入；不点默认已选的 API 协议。
- **附录空闲判定：** `停止生成` / Deep diving 为忙；空草稿禁用发送仍算空闲。
- **拒绝审批：** 只读预设用 **aria-label**（FlipText 会把「仅可查看」留在 textContent 里造成假已切换）。触发写文件升级后再点「拒绝」。workspace-write 下 `echo` **不会**出审批条（官方只对沙箱升级询问）。
- **识图：** 冒烟 home **去掉**从 `~/.dsh` 拷来的 `vision-fallback`（该路由曾 403 RegionError）。主模型不识图时断言发送前「当前模型不支持图片」。
- **提问条：** 模型有时用「跳过本题」而不是工具升级；walker 会点跳过，但仍可能等不到 `[data-approval-key]`。

---

## 3. 用例结果摘要

图例：Pass / Fail / Blocked / Partial / N/A / **无效 Pass**（源码或本机 dist 证据，不能当安装包发版）。

### 安装与启动

| ID | 结果 | 依据 |
| --- | --- | --- |
| TC-INST-001 | **无效 Pass** | 源码冷启动 + 本机 SHA，不是 CI artifact + 已装快捷方式 |
| TC-INST-002 | **无效 Pass** | 同源 Electron 双开，未点已装快捷方式 |
| TC-INST-003 | **无效 Pass** | 附录/source 冷启动，非已装 CI 包 |
| TC-INST-004～006 | **无效 Pass** | `qa:shell` |
| TC-INST-007 | N/A | P1 造障，本轮未测倒计时取消 |
| TC-INST-008 | **无效 Pass** | 未绑 CI artifact；Release 文案仍可能写 0.1.0-rc.7 |
| TC-INST-009 | **无效 Pass** | 本机 `/S` 记录，不是「测完的 CI SHA 即拟发布文件」 |
| TC-INST-010 | N/A | P1 未卸载 |
| TC-INST-011 | Partial | 2026-08-22 毒化 `~/.dsh` 后桌面仍进 UI；非本轮 CI SHA 全表 |
| TC-INST-012 / 013 | 未测 | 当时无此两条 |

### 模型

| ID | 结果 | 依据 |
| --- | --- | --- |
| TC-MODEL-001 | **无效 Pass** | `qa:source` |
| TC-MODEL-003 | **无效 Pass** | 附录 walker |
| TC-MODEL-004 | N/A | grok-4.6 无思考档位编辑器（`models.thinking` SKIP） |
| TC-MODEL-005 | **无效 Pass** | `appendix.vision` |

### 工作区 / 对话 / 审批

| ID | 结果 | 依据 |
| --- | --- | --- |
| TC-WS-001 | **无效 Pass** | 附录/source 临时 Git 工作区，非 TC-WS-006 已装路径 |
| TC-WS-002 | **无效 Pass** | `qa:shell` |
| TC-CHAT-001～005 | **无效 Pass** | 冒烟 userData 附录，非 CI 安装包会话 |
| TC-CHAT-006～008 | **无效 Pass** | `qa:composer` |
| TC-CHAT-009 | **无效 Pass** | 附录 walker |
| TC-APPROVE-001 | **无效 Pass** | 附录 walker |
| TC-APPROVE-002 | **无效 Pass** | 附录 walker（产品路径可参考，不能当安装包 Pass） |
| TC-SESS-003 | **无效 Pass** | `qa:shell` |

### Git / Surfaces / 终端 / 外观 / 扩展

| ID | 结果 | 依据 |
| --- | --- | --- |
| TC-GIT-001 等 P0 | **无效 Pass** | `qa:source` 只测启动工作区；其后安装包兄弟仓空菜单 |
| Surfaces / 终端 P0 | **无效 Pass** | `qa:source`；其后安装包兄弟仓「无法启动终端」 |
| TC-APP-001～003、005～006、008 | **无效 Pass** | `qa:source` |
| EXT / dshbot / NEG-001 | **无效 Pass** | `qa:source` |
| TC-DESK-001～004 / NEG-005 | **无效 Pass** | `qa:shell` |

### 远程

| ID | 结果 | 依据 |
| --- | --- | --- |
| TC-REM-001 | **无效 Pass** | `qa:composer`，非已装 CI 包 |
| TC-REM-002 | Blocked | 手机扫码登录并发消息**未测**。书面豁免：功能尚未开发完成（2026-08-23）。桌面侧监听 / 二维码 / SPA 文档见 TC-REM-001，不替代本条 |

### 负向

| ID | 结果 | 依据 |
| --- | --- | --- |
| TC-NEG-002 | **无效 Pass** | `qa:shell` |
| 其它造障 P0 | 见上 INST-011 | 未静默标 Pass |

---

## 4. 附录 A 原始记录（节选）

五轮门禁多次全绿。完整 extras 同一次跑通的组合：

- 拒绝升级：**PASS** `dsh-appendix-qa-4seZmX`（`the user rejected escalating this operation to "workspace-write"`）
- 识图拒绝：**PASS** `dsh-appendix-qa-rA8aaG`（当前模型不支持图片）

同一次跑里 extras 同时全绿尚未做到（拒绝与识图分属两次制品）。

---

## 5. 豁免与备注

1. **TC-REM-002（P0）豁免：** 手机扫码 → SPA 列会话并发一条，本轮不测。原因：手机远程尚未开发完成。后续补测后再标 Pass/Fail。**不得标 Pass。**
2. **本报告全体「Pass」不作发版许可。** 源码套件未覆盖同版本 overlay、兄弟仓授权、CI `node.exe`、打包 Ghostty。本机 `qa:packaged` FAIL 也不能改成可交付条件。发版只认 CI windows artifact SHA + 全表 + §16。
3. **TC-INST-002：** 同源 Electron + 同一 `user-data-dir` 已证第二进程退出；未点已装快捷方式第二次。
4. 只读会话若走提问条而不是工具升级，拒绝 walker 可能超时；工具升级路径已证。

P1 卸载、P1 远程审批、Wallhaven 本机超时不阻塞本表 P0。

---

## 6. 签字栏

| 项 | 内容 |
| --- | --- |
| 安装包文件名 | `Deepseek-Harness-Desktop-Setup-0.2.6.exe` |
| SHA256（Release） | `7e815e5d9f8f6f2bac6fec693db83710c61a948617a961eacc15537a17019abe` |
| SHA256（本机重建） | `e893380e92ee261ead17869e617b27f282ab50633b7aa09aa9935034e4edded3`（09:11；`qa:packaged` 打印） |
| 可交付？ | **否。** 无 CI artifact 全表；源码 Pass 与安装包失败冲突。TC-REM-002 书面豁免不得标 Pass |
| 豁免单 | 2026-08-23 本报告 §5.1；产品说明手机先跳过 |
