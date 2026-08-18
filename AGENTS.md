# AGENTS.md — Deepseek-Harness-Desktop

Electron desktop shell around the official DeepSeek Harness Web UI (`vendor/deepseek-harness`).

## Design language (mandatory)

Any UI, layout, or frontend change must follow the official `dsh web` visual language. Do not invent a second skin for the desktop chrome or new panels. The boot page is the documented instrument-canvas exception in [docs/design-language.md](docs/design-language.md#桌面启动页); do not spread that sheet.

- Product spec: [docs/design-language.md](docs/design-language.md)
- Motion recipes and inventory: [docs/motion.md](docs/motion.md)
- Token / CSS Modules mechanics: [vendor/deepseek-harness/docs/web-styling.md](vendor/deepseek-harness/docs/web-styling.md)
- Client plugin rules: [vendor/deepseek-harness/packages/client/AGENTS.md](vendor/deepseek-harness/packages/client/AGENTS.md)

Reuse `ui-primitives` and `--dsw-alias-*` tokens. The boot page consumes official font/motion tokens from [src/shared/dsh-webui-tokens.css](src/shared/dsh-webui-tokens.css) plus the `--boot-*` table in [src/renderer/boot-tokens.css](src/renderer/boot-tokens.css).

Harness-internal work also follows [vendor/deepseek-harness/AGENTS.md](vendor/deepseek-harness/AGENTS.md).

## Surfaces and terminal (work loops)

The right column and conversation terminal drawer implement **work loops** (Files search/save, Browser navigation, Diff scopes, selection into chat), not an empty-state card grid. Empty-state cards are not done. Contract: [2026-08-16-surfaces-terminal-work-loops.md](vendor/deepseek-harness/.agents/notes/implemented/feature/2026-08-16-surfaces-terminal-work-loops.md). Out of scope (GPU terminal embedding, worktree, turn-diff, review comments, PiP, jump-to-line) stays in that note; do not fake those capabilities.

Surface tabs keep the close control **to the right of the title**. Do not move it unless the user explicitly asks.
