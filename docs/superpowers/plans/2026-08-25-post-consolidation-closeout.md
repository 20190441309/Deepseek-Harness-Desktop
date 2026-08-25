# 合并收口（Post-consolidation closeout）：#39 落地、node-half 修复、QA 与实机缺口计划

> **For agentic workers:** 本计划同时是设计文档与执行记录：Phase 1–4 已在云端执行完毕（含证据），Phase 5–6 是留给实机/人工的可执行手册。复核时用 checkbox 对账。

**Goal:** 把合并 PR #39（`cursor/consolidate-open-prs-562f`）安全落到 `main`、关闭全部被替代 PR、删除已并入的远端分支；修复 main 上遗留的 `node-half.client.spec.ts` 红灯；用**合并后树**的新数字刷新相关 feature card 的 `last verified`；把仅剩的两个实机缺口（Windows git-titlebar、TC-EXT-007 dshbot 冒烟）落成可一键执行的验证手册。

**Non-goals:**

- 不在本轮实现任何新产品行为（无新 UI、无新 IPC、无新插件能力）。
- 不做 GPU 终端嵌入、worktree、turn-diff、review-comment pick（work-loops note 明确 out of scope）。
- 不在云端 Linux 伪造 Windows / 实机结论：跑不了的门只落手册与 Pass/Fail 标准，不填结果。
- 不动官方 `~/.dsh`、不重写 vendor pin。

**Touching:** 本文件为 docs/plans 落盘；代码改动仅 `vendor/deepseek-harness/tsconfig.base.json` 一行（测试基础设施，局部修复，不改产品契约，详见 Phase 3 的 Feature Spine 说明）；feature card 仅刷 `last verified` 字段。

**Review provenance:**

- 父代理对 PR #39 的合并审查结论（2026-08-25）：#36/#34/#37/#35/#38 已并入一支，#33/#32/#25/#24 经 ancestry 验证被 #36 包含；desktop `npm test` 997 绿；harness `test:gui` 仅剩 `node-half.client.spec.ts` 一个 main 既有红灯。
- 云端子代理本轮复核（模型 `claude-fable-5-thinking-high`，2026-08-25）：全部 ancestry 重新独立验证（见 Phase 1 证据）。

---

## 依赖顺序与风险

```
Phase 1 落地 #39 → Phase 2 关 PR / 删分支（GitHub 检测 head 可达自动完成大半）
                 ↘ Phase 3 node-half 修复（依赖合并后树，但对 main 也独立成立）
                       → Phase 4 刷 feature card last verified（依赖 3 的新绿数字）
Phase 5 Windows git-titlebar 实机   —— 独立，仅依赖 CI 安装包
Phase 6 TC-EXT-007 dshbot 冒烟      —— 独立，仅依赖 CI 安装包（手册已在库内）
```

**风险 R1 —— #33 vs #37 双实现残渣。** #33（production-hardening）与 #37（surfaces/terminal Phase 0–5）都动过保存竞态、`` Ctrl+` `` 快捷键与 preview-automation 链；#39 合并时按「#37 架构胜出」解了 20 处冲突，并追加 `6343b9b3` 删掉与 #37 冒泡设计矛盾的旧 drawer-chord `preventDefault` 断言。**复核结论（本轮）：** 合并树上 `preview-automation` 仅剩两处**反向守卫**断言（`src/main/preview.test.js:795`、`src/preload/shell-api.test.js:125`，断言链路保持删除态）；`ui-titlebar` / `ui-user-terminal` 无 `.xterm` 残留；desktop 997 绿 + harness `test:gui` 5338 绿（见 Phase 3）即无残渣破门。风险闭合。

**风险 R2 —— PR 关闭顺序。** 若先手动 close 被替代 PR 再合 #39，GitHub 将失去把它们标为 `MERGED` 的机会（close ≠ merged，追溯性差）。**正确顺序（已按此执行）：** 先把 #39 的 head 合入 main，GitHub 检测到各 PR head 可达 main 后自动把 #24、#25、#32–#38 全部标 `MERGED`，无需任何手工 close。

**风险 R3 —— 误删未并入分支。** 删除前对每支跑 `git merge-base --is-ancestor origin/<branch> main`；不满足的一律保留并上报。（本轮全部满足，见 Phase 2。）

**风险 R4 —— tsconfig paths 改动影响面。** paths 是全仓测试/静态门的源面解析入口，加错映射可能让 lib/ 双单例问题复发。缓解：只加**精确子路径**一条（exact match 优先于通配，不影响其他包）；typecheck + test:gui 全绿后才提交。

---

## Phase 1 — 落地 PR #39（已执行 ✅）

- [x] 复核 mergeability：`gh pr view 39` → `MERGEABLE`；`git rev-list origin/cursor/consolidate-open-prs-562f..main` 为空（main 无分叉，可安全合并）。
- [x] 独立重验 ancestry（不轻信 PR body）：#36/#34/#37/#35/#38/#33/#32/#25 的 head 与 #24 的 head SHA `b2dfc759` 全部是 #39 head 的祖先。
- [x] 本地 `git merge --no-ff` 合入 main，合并树跑 desktop `npm test`：**997 pass / 0 fail / 3 skip**（与父代理审查数字一致）后才 push。
- [x] `git push origin main`（普通 push，非 force）→ main `c8fdbc27..ea659884`。

## Phase 2 — PR 关闭与分支清理（已执行 ✅）

- [x] push 后确认 GitHub 自动把 **#24、#25、#32、#33、#34、#35、#36、#37、#38、#39 全部标 `MERGED`**；`gh pr list --state open` 为空。
- [x] 逐支验证包含关系后删除远端分支（14 支中 5 支已被 GitHub 自动删除，其余 9 支手动删除）：
  `consolidate-open-prs-562f`、`delivery-closeout-2026-08-25-cbe8`、`git-titlebar-review-remote-switch-b001`、`surfaces-terminal-hardening-449e`、`message-edit-production-polish-c3ee`、`marketplace-desktop-integration-7027`、`production-hardening-delivery-3eb5`、`branch-review-merge-6e0a`、`mobile-web-scan-parity-plan-fbe6`（手动）；`desktop-launcher-cold-start-fixes-c4f7`、`dshbot-standalone-plugin-6ce3`、`mobile-web-scan-android-parity-cf23`、`official-home-import-productionize-c4f7`、`surfaces-terminal-review-plan-ee9b`（自动）。
- [x] 终态：远端仅剩 `main`（+ 本轮工作分支）。

## Phase 3 — `node-half.client.spec.ts` 修复（已执行 ✅）

**症状：** `pnpm run test:gui` 下该 spec 整文件挂：`Cannot find package '@deepseek-ai/dsh-app-boot/features' imported from packages/client/modules/src/index.ts`。main 既有（早于 #39）。

**根因：** harness 的「源面 vs 制品面不混用」规则由 `tsconfig.base.json` 的 `paths` 表实现（vitest 经 `vite-tsconfig-paths` 读同一张表，且 *paths 必须赢过 package exports*，避免 lib/ 二次单例）。表里通配 `@deepseek-ai/dsh-*` 只映射到 `./packages/boot/*/src` 等**包主 id**；`@deepseek-ai/dsh-app-boot/features` 这种子路径无精确条目，通配把 `*` 吞成 `app-boot/features` 后替换出不存在的目录，解析回落到 package exports 的 `./lib/features.js` —— 未 build 即不存在。

**方案取舍：**

| 选项 | 评估 |
| --- | --- |
| A. `paths` 加精确条目 `"@deepseek-ai/dsh-app-boot/features": ["./packages/boot/app-boot/src/features.ts"]` | **选定。** 与既有先例同构（`dsh-mcp-servers-file` 主 id 映射修复、各 `/types`、`/client` 精确条目）；一行、零行为面 |
| B. 测试前先 build app-boot | 违反源面规则（lib/ 双单例风险），且把「clean tree 即绿」门做脏 |
| C. spec 内 mock 掉 features 导入 | 掩盖解析缺口，下一个从源面 import 该子路径的包还会挂 |

**Feature Spine 说明：** 这是 vendor/harness 测试基础设施的局部修复，不改任何产品契约，不属于任何 feature card 的行为面（对应卡规则中的「本地修复，不改产品契约」声明）。commit：`fix(vendor): tsconfig 补 dsh-app-boot/features 子路径映射，修复 node-half spec 源面解析`。Agent Note 豁免理由：机械性单行 paths 补条目，与先例 `3fd08587` 同类。

- [x] 复现（合并树 + 干净 install）：spec 整文件挂，报错与父代理记录一致。
- [x] 落方案 A；单 spec 重跑 **27/27 绿**。
- [x] `pnpm run test:gui`（合并树 + 修复）：**409 文件全绿（1 skip），5338 pass / 4 skip / 0 fail**。
- [x] `pnpm run typecheck` 绿（paths 改动无类型面回归）。

## Phase 4 — Feature card `last verified` 刷新（本轮执行 ✅）

只刷有**本环境新证据**的卡；不编造数字，不动不变量。

| 卡 | 刷什么 | 证据 |
| --- | --- | --- |
| `surfaces-work-loops` | 合并后树数字：desktop `npm test` 997 绿；harness `test:gui` 5338 绿（node-half 修复后 0 红）；`qa:source` 本轮结果 | Phase 1/3 + 本轮 qa:source 日志 |
| `terminal-drawer` | 同上（合并树含 drawer-chord 断言清理，`test:gui` 全绿即覆盖） | 同上 |
| `message-edit` | `test:gui` 合并树全绿（含 ui-message-edit / ui-conversation 编辑会话规格） | Phase 3 |
| `marketplace-settings` | desktop `npm test` 997 绿（含 dshmarket-preset / ui-settings-market 相关单测） | Phase 1 |
| `git-titlebar` | 合并树 desktop 997 绿（git 链单测在内）；实机 Windows 仍缺口（Phase 5） | Phase 1 |

不刷：`dshbot`（TC-EXT-007 实机仍阻塞，卡已如实记载）、`mobile-remote` / launcher / wallpaper 等本轮无新证据的卡。

## Phase 5 — Windows git-titlebar 实机验证手册（待实机执行 ☐）

**目标不变量（卡 `git-titlebar`）：** Windows 上 git 子进程超时/输出超量必须 `taskkill /PID /T /F` 杀整棵树（hooks/ssh 不残留）；taskkill 非零退出回退 `child.kill()`；兄弟仓登记后标题栏即刻授权（首载竞态修复）。

**前置：** Windows x64 实机或长驻 VM；一次 test.yml 已绿的 CI `DeepSeek-Harness-windows-x64` artifact（记录 CI SHA）；同 SHA 检出。

**步骤与 Pass/Fail：**

1. 静默安装 Setup，正常启动，打开一个真实 git 仓库工作区。
   - Pass：标题栏显示当前分支；分支菜单可搜索/切换/创建。
2. **兄弟仓首载竞态**（TC-WS-006 / TC-GIT-001 实机位）：以 `Documents\Deepseek-Harness-Desktop` 类目录启动，会话 cwd 指向兄弟目录仓（如 `C:\Ai\ChisaTerminal`），观察首次登记后**不聚焦窗口**的行为。
   - Pass：登记写入 `workspace.json` 后标题栏无需重新聚焦即显示分支（`shell:git-workspaces-changed` 推送生效）；Fail：空态或需点窗才刷新。
3. **进程树查杀**：在仓库 `.git/hooks/pre-commit` 挂一个 `powershell -c sleep 600` 的 hook，触发 commit 使 git 超时。
   - Pass：超时后 `tasklist` 无残留 `git.exe`/`powershell.exe` 子树、`.git/index.lock` 不残留；再次 commit 正常。
   - 变体：用受限 ACL 使 `taskkill` 拒绝访问 → Pass 标准为 git **直接子进程**仍被 `child.kill()` 收掉、UI 报错不永久 loading。
4. 白名单外分支名（如含 `^` 的合法 git 名）：picker 列出但该行禁用 + hint。
5. 跑生产表 `TC-GIT-001`…`007`、`TC-WS-006`。

**证据落点：** `docs/qa/results/<日期>/git-titlebar-windows.md`（步骤输出 + CI SHA + tasklist 截查），回填 production-acceptance 汇总表；更新 `git-titlebar` 卡 `last verified` 移除「实机 Windows 仍未覆盖」句。

## Phase 6 — TC-EXT-007 dshbot 安装冒烟（待实机执行 ☐）

执行手册已完整落库：[docs/qa/tc-ext-007-dshbot-install-smoke.md](../../qa/tc-ext-007-dshbot-install-smoke.md)（Phase A 默认无页签 / Phase B 市场一键装+建群 / Phase C 卸载无残留，A/C 自动化探针 `plugin.dshbot.*` 已在 walk 内）。

**阻塞（复核仍成立）：** 云端 Linux 跑不了 Windows NSIS 安装包与打包 Electron GUI；唯一纯手工步骤是 Phase B 的建群冒烟。**不得**用旧「停放 Pass」冒充。

**证据落点：** `docs/qa/results/<日期>/` 三相报告 + CI SHA；汇总表 TC-EXT-007 行；`dshbot` 卡 Open follow-ups 首行。

---

## QA 矩阵：哪些门在云端/CI 可闭合，哪些必须实机

| 门 | 云端/CI | 实机 Windows/人工 | 本轮状态 |
| --- | --- | --- | --- |
| desktop `npm test` | ✅ | — | 997/0/3 绿（合并树） |
| harness `pnpm run test:gui` | ✅ | — | 5338/0 绿（修复后） |
| harness `pnpm run typecheck` | ✅ | — | 绿 |
| `npm run qa:source`（xvfb + 源码 Electron） | ✅ | — | surfaces/terminal/files/diff/agents/git/market/dshbot 步骤全 PASS；仅壁纸区既知 3 项环境失败（`appearance.localCrop`/`gallery.confirmSet`/`appearance.frost`，与合并前记录一致，非回归） |
| `smoke:packaged` / `qa:packaged`（Linux 包） | ✅（CI artifact） | — | 未在本轮重跑（无行为改动） |
| TC-WS-006 / TC-GIT-001…007 实机 | rehearsal 仅 | **必须**（Phase 5） | ☐ 待实机 |
| TC-EXT-007 dshbot 三相 | A/C 探针 rehearsal | **必须**（Phase 6，B 相纯手工） | ☐ 待实机 |
| TC-REM-002 真机扫码 | — | 必须（mobile-remote 卡既有缺口，不在本计划内展开） | ☐ |

## Rollout / rollback

- **Rollout：** main 已含全部合并；本工作分支（plan + tsconfig 一行 + 卡刷新）独立可并，无 stacking（#39 已落地，方案 (b)：直接基于新 main）。
- **Rollback：** 若合并树暴露未预见回归，用 `git revert -m 1 ea659884` 一次性回退整个 consolidation 合并（分支已删但对象仍在，PR #39 页面可找回）；node-half 修复独立成 commit，可单独 revert；卡刷新纯 docs。**不 force-push main。**
- 分支删除均验证过 ancestry，可随时从对应 merge commit / PR 页恢复。

## Open questions

无阻塞性未决项。Phase 5/6 仅等待实机资源（Windows x64 + 已绿 CI artifact），手册与 Pass/Fail 标准已备齐。
