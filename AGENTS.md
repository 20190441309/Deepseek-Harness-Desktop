# AGENTS.md — Deepseek-Harness-Desktop

Electron desktop shell around the official DeepSeek Harness Web UI (`vendor/deepseek-harness`).

## Design language (mandatory)

Any UI, layout, or frontend change must follow the official `dsh web` visual language. Do not invent a second skin for the desktop chrome, boot page, or new panels.

- Product spec: [docs/design-language.md](docs/design-language.md)
- Token / CSS Modules mechanics: [vendor/deepseek-harness/docs/web-styling.md](vendor/deepseek-harness/docs/web-styling.md)
- Client plugin rules: [vendor/deepseek-harness/packages/client/AGENTS.md](vendor/deepseek-harness/packages/client/AGENTS.md)

Reuse `ui-primitives` and `--dsw-alias-*` tokens. The boot page consumes [src/shared/dsh-webui-tokens.css](src/shared/dsh-webui-tokens.css). `src/renderer/marketplace/marketplace.css` still carries a parallel palette; do not copy those hex values.

Harness-internal work also follows [vendor/deepseek-harness/AGENTS.md](vendor/deepseek-harness/AGENTS.md).
