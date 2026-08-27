# Vendor packages

| Path | Package | Status | Role |
| --- | --- | --- | --- |
| `deepseek-harness/` | Official Harness fork | active | Agent runtime + 19 desktop fork UI/host packages |
| `dsh-usage-panel/` | `dsh-usage-panel` | active / in-box | Settings → 用量统计 (web-app bundle) |
| `dsh-im/` | `@xmanrui/dsh-im` | active / in-box | Settings → Remote → 消息渠道 (web-app bundle) |
| `dshbot/` | `dshbot` | standalone | Optional market install; not pre-mounted |
| `dshmarket/` | `dshmarket` | dropped | Attribution stub only |
| `chisacode-remote/` | ChisaCode Remote | active | Phone pairing infrastructure (not a profile bundle) |

Built-ins compose through `@deepseek-ai/dsh-web-app` (`cordis.patch.yml` rows). Runtime copies land in harness `node_modules` via `scripts/link-desktop-builtin-packages.js` (dev) and `scripts/after-pack.js` (packaged).

Install tool: `@deepseek-ai/dsh-desktop-install` in `deepseek-harness/packages/host/desktop-install/` (synced from `src/host/`).
