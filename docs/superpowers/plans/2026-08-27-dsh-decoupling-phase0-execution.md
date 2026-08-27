# dsh decoupling Phase 0 execution — instrument the boundary

**Date:** 2026-08-27 · **Baseline:** `main@581547eb` · **Branch:** `cursor/dsh-decoupling-phase0-aebd`
**Parent analysis:** [2026-08-27-dsh-decoupling-analysis.md](2026-08-27-dsh-decoupling-analysis.md) (§4 migration path)

**Touching:** no feature card — tooling + docs only. No product behavior, IPC, overlay, spawn, or composition change. Wholesale decoupling (Scenarios B/D/E) stays rejected per the analysis; this executes Phase 0 plus the safe Phase 1/2 documentation slices.

## Scope

| Item | Analysis ref | Deliverable |
| --- | --- | --- |
| 0.1 Fork-delta classifier | §4 Phase 0, §6.1 | `src/shared/harness-fork-delta.js` (+ tests) classifying diff-vs-pin paths into registered-package / marked-file / composition / unregistered; runner `scripts/check-harness-fork-delta.js`; `npm run check:fork-delta`; CI job in `test.yml` (PR-blocking against a measured baseline) |
| 0.2 Upstream sync dry-run | §4 Phase 0, §2.C.2 | `scripts/check-harness-sync-dry-run.js` reusing `harness-sync.js --dry-run`; `npm run check:sync-dry-run`; scheduled + manual workflow `.github/workflows/harness-sync-dry-run.yml` (report-only, no pin bump) |
| 0.3 Token mirror drift check | §6.5, §1.6 | `src/shared/dsh-webui-token-mirror.js` (+ tests incl. an integration case on the real files) comparing `src/shared/dsh-webui-tokens.css` `--dsw-*` values against resolved `ui-theme design-platform.css`; runs inside `npm test` |
| 1.1 dsh-tools handoff refresh | §2.G | Verify the post-merge cherry-pick instructions in [2026-08-27-dsh-tools-upstream-handoff.md](2026-08-27-dsh-tools-upstream-handoff.md) actually apply; record that upstream moved to `dsh-v0.1.1-rc.2` without the fix. No pin change |
| 2.1 Sidecar-by-default policy | §2.F rule | Short policy section in `docs/features/README.md` |
| 2.2 Host-package extraction | §2.F | **Documented only, not executed** — candidates `packages/host/mcp-servers`, `host/skill-inventory`, `mcp/mcp-servers-file`, `llm/llm-vision-fallback`; deferred until one of them next needs real changes (analysis: “opportunistically, not as a program”) |

## Measured numbers (2026-08-27, pin `dsh-v0.1.1-rc.1` @ `528c682e`)

Diff `git diff-tree -r 528c682e^{tree} HEAD:vendor/deepseek-harness`, 1,372 changed paths:

| Bucket | Count |
| --- | --- |
| registered-package (under a `DESKTOP_PACKAGES` dir) | 431 |
| marked-file (`FORK_FILE_MARKERS`) | 18 |
| composition (`COMPOSITION_ROWS` patch files) | 2 |
| **unregistered** | **921** (306 added, **604 modified upstream files**, 8 type changes, 3 deleted) |

The 604 unregistered-modified count is the §6.1 gap made machine-readable (analysis estimated ~605: 625 modified minus markers). Unregistered-added hotspots are dominated by `.agents/notes` (232) and desktop feature slices in `apps/web` / `ui-conversation` / `ui-theme`. Baseline constants live in `src/shared/harness-fork-delta.js` (`UNREGISTERED_BASELINE = { total: 921, modified: 604 }`); the CI gate fails only when a count **exceeds** its baseline, and prints a reminder to lower the baseline when drift shrinks.

Sync dry-run vs upstream `dsh-v0.1.1-rc.2` (`b150a551`, current upstream HEAD): **20 conflict files** (runtime sessions contract, ui-conversation locales/skeleton, ui-permission-presets, apiproxy sessions API, llm/tool-fs docs + read-image snapshot, ui-layout package.json).

## Gates

- `npm test` (includes the new classifier + token-mirror suites; token integration case reads the real CSS pair)
- `node scripts/check-harness-fork-delta.js` green at baseline
- `node scripts/check-harness-sync-dry-run.js` completes read-only and reports the conflict count
- No change to `check-skip-compose-contract.js` inputs → not re-run beyond CI
- vendor `test:gui` untouched (no vendor-tree file changes in this branch)

## Rollback

Delete the two scripts, the two CI additions, and the two shared modules; revert the doc edits. No runtime surface depends on any of it.
