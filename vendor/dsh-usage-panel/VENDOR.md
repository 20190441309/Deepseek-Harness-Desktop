# Vendored dsh-usage-panel

Desktop snapshot of the MIT plugin used for Settings → 用量统计.

- Source: https://github.com/AlfredChaos/dsh-usage-panel
- Upstream commit: `12ac109bc6213bdbca539e3199e7338fcac020ed`
- npm version: `0.2.0`
- License: MIT (`LICENSE`)

Runtime dependency: `zod` (installed into this package's `node_modules`).

## Local modifications

- Client esbuild `external`: `react` and `@deepseek-ai/dsh-client-ui-primitives`. `apply` skips section registration when `Button` / `Menu` are missing (`missingPrimitives`).
- Nav label is 「用量统计」 / `Usage stats`.
- Heatmap ramps, chart `PALETTE`, provider bars, and subagent tags use `--dsw-alias-*` / `--dsw-static-deepseek-*` / `color-mix` only. No `[data-ds-dark-theme]` in feature CSS.
- Refresh and export use host `Button` / `Menu`. Pointer-follow chart tips stay self-drawn and tokenized (official `Tooltip` is an anchored string bubble).
- Type 16/24, 14/22, 12/18; weights 500/600/700; spacing multiples of 4; shadows `lv1`–`lv3`. Motion is opacity/transform.
- `scripts/build.mjs`, `wrap-client.mjs`, and `run-tests.mjs` use `fileURLToPath` so Windows can rebuild `lib/` and run tests.
- Day buckets stay UTC (`stateVersion` unchanged).
- Projection unit uses current `stateSchema` + `wire` (not host-only `schema`/`view`); `inject` waits for `sessionProjections` / `sessionQuery` / `sessionProjectionCache` before `register`. Missing `usagePanel` cells stay pending — no jsonl replay.
- zh `fmtTokens` stays integer until 10万; empty UI only when billed `sessionCount` is 0 and `sessionsFailed` is 0 (blank-only sessions included; scan failures still show the dashboard).
- Heatmap h0 uses tokenized `color-mix` plus inset `border-l2` so empty cells are visible in light theme; legend includes the empty level.
