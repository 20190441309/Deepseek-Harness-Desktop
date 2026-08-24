# Feature: Official home import

| Field | Value |
| --- | --- |
| **id** | `data-import` |
| **status** | `active` |
| **last verified** | 2026-08-24 — 插件重装新增受控 registry `name@semver` 通道并预标 unsupported；journal `copying` 由启动器消费（清 `.import-tmp` + 提示重跑） |

## User paths

1. 启动器「导入」自动只读扫描官方 `~/.dsh`（会话、附件、`profiles/web/package.json` 插件名单、`skills/`、`mcp-servers.yaml`）以及 `~/.agents/skills`。
2. 「选择目录」另加一个按 home 布局扫描的来源；「添加技能目录」把含 `SKILL.md` 的根并入技能列表。不扫项目仓库，除非用户主动选中该文件夹。
3. 导入页用分类页签勾选会话 / 技能 / 插件 / MCP，默认可导入项全勾。空选点导入 = 不写盘。落点固定桌面 `userData/dsh-home`。
4. 插件只按名单 `dsh plugin add` 重装，不拷 `node_modules` / `desktop-plugins`。支持两条受控通道：`github:owner/repo[#ref]` 与官方 registry semver（重装为 `name@<semver>`，含 `^`/`~`）。本地 `file:` / `link:` / `workspace:`、模板包、已下架包、其余规格（tarball URL、dist-tag、npm alias 等）在扫描时预标禁用行（`unsupported`），UI 灰置并给理由，勾不了也不会送进 `pnpm add`。
5. MCP 按 id merge 进桌面 `mcp-servers.yaml`（含 header/token）；UI 与日志不展示密钥。附件整树拷 `attachments/`。
6. 导入时若桌面端在跑：先停内核。导入本身幂等（conflict 默认 skip）。崩溃续跑：冷启动闸门消费 `phase:'copying'` 的 journal——清理桌面 home 下残留 `.import-tmp` staging 目录、journal 改写为 `recovered`、启动器停在导入页并提示可安全重跑。

## Invariants

- 官方 `~/.dsh` 与 `~/.agents` **只读**：不写、不删、不清理。
- Harness / PTY / Electron `process.env.DSH_HOME` 仍不准指向官方 home。
- 不拷工作区工程树、项目 `.dsh/skills`（除非用户把该目录选进来源）、`profiles/`、凭据、`settings.yaml`、旧 SQLite 会话库。
- 不改会话文件夹名、不改写 jsonl。旧 rc `.db` 标不兼容并跳过。
- `runImport` 必收勾选；省略选择 = 零写入。路径穿越与源根外技能路径拒绝落盘。
- 插件重装规格只允许 `github:owner/repo[#ref]` 或 `name@<semver>`（`installImportPlugin` 受控通道，仅主进程 LAUNCHER IPC 使用）；渲染进程 / 工具的 `installPlugin` 通道保持 github-only。
- journal 在 `userData/import-journal.json`，不在 `dsh-home/sessions` 里。`recoverInterruptedImport` 只清 journal 自己的 destHome 且必须等于当前桌面 home；官方来源仍只读。
- 已知权衡（MCP 凭据）：MCP merge 原样拷贝 header/token 进桌面 `mcp-servers.yaml`（明文，与官方 CLI 相同的落盘形态）；OAuth 类服务器的会话态/刷新令牌不迁移，导入后可能需在桌面端重新授权。桌面不回写官方文件。

## Allowed touch

- `src/main/data-import.js` 与其单测
- 启动器导入页 UI（`src/renderer/launcher.*`）
- `src/main/ipc.js`、`src/preload/index.js` 与其单测
- `docs/features/dsh-home.md` / `desktop-launcher.md` 只读扫描例外
- `.cursor/rules/data-import-product.mdc`

## Do not touch

- vendor 会话格式
- 自动静默迁移（无用户确认不得拷）
- 把桌面 `DSH_HOME` 指回 `~/.dsh`

## Gates

| Kind | What |
| --- | --- |
| Automated | `data-import` 与 IPC 勾选转发单测 |
| Manual / QA | `TC-LAUNCH-004` |

## Sources

- Implementation：`src/main/data-import.js`、`src/renderer/launcher.js`
