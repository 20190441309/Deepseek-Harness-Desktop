# Feature: Official home import

| Field | Value |
| --- | --- |
| **id** | `data-import` |
| **status** | `active` |
| **last verified** | 2026-08-24 — 启动器导入改为分类页签 + 底栏主按钮；会话按目录分组；IPC 勾选契约未改 |

## User paths

1. 启动器「导入」自动只读扫描官方 `~/.dsh`（会话、附件、`profiles/web/package.json` 插件名单、`skills/`、`mcp-servers.yaml`）以及 `~/.agents/skills`。
2. 「选择目录」另加一个按 home 布局扫描的来源；「添加技能目录」把含 `SKILL.md` 的根并入技能列表。不扫项目仓库，除非用户主动选中该文件夹。
3. 导入页用分类页签勾选会话 / 技能 / 插件 / MCP，默认可导入项全勾。空选点导入 = 不写盘。落点固定桌面 `userData/dsh-home`。
4. 插件只按名单 `dsh plugin add` 重装，不拷 `node_modules` / `desktop-plugins`。本地 `file:` / `link:` / `workspace:`、模板包、已下架包为禁用行。
5. MCP 按 id merge 进桌面 `mcp-servers.yaml`（含 header/token）；UI 与日志不展示密钥。附件整树拷 `attachments/`。
6. 导入时若桌面端在跑：先停内核。崩溃后续跑 journal。

## Invariants

- 官方 `~/.dsh` 与 `~/.agents` **只读**：不写、不删、不清理。
- Harness / PTY / Electron `process.env.DSH_HOME` 仍不准指向官方 home。
- 不拷工作区工程树、项目 `.dsh/skills`（除非用户把该目录选进来源）、`profiles/`、凭据、`settings.yaml`、旧 SQLite 会话库。
- 不改会话文件夹名、不改写 jsonl。旧 rc `.db` 标不兼容并跳过。
- `runImport` 必收勾选；省略选择 = 零写入。路径穿越与源根外技能路径拒绝落盘。
- journal 在 `userData/import-journal.json`，不在 `dsh-home/sessions` 里。

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
