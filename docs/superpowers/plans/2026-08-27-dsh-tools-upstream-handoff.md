# dsh-tools upstream handoff checklist

**Goal:** Submit the tool-call integrity fix (desktop PR #54, feature card [dsh-tools](../../features/dsh-tools.md)) to the official `deepseek-ai/deepseek-harness` repository. This document exists because the desktop CI environment has no write access to the upstream repository; a maintainer with access executes the checklist.

**Do not** update `vendor/harness-upstream.json` until upstream has merged and tagged a release containing the fix; the pin records the integrated official baseline, never a pending PR.

**Upstream status check (2026-08-27):** upstream has since tagged `dsh-v0.1.1-rc.2` (`b150a551`, current upstream HEAD). Verified it does **not** contain the fix (`requireValidToolCallIdentity` absent from `b150a551:packages/llm/llm/src/content.ts`), so this handoff is still pending; base the upstream branch on rc.2.

## What the patch contains

All changes live under `vendor/deepseek-harness/` and are now **merged into `main`** via PR #54 (merge commit `cac4f790`; the fix itself is `f8c1deb7`, and the original head branch `cursor/fix-unknown-tool-empty-name-8eab` has been deleted). Two touched packages (`core/session`, `core/agent-loop`) also carry the earlier desktop commit `ddabf839` (tool-call result pairing recovery for scheduler failures — same tool-call-integrity area, `tool-transcript.ts` predates #54), so the upstream submission is the **cumulative** touched-path diff vs. the pin, covering both fixes:

- `packages/llm/llm/` — `requireValidToolCallIdentity` / `isValidToolCallIdentity` (`content.ts`), assembler rejection of nameless or id-less tool calls, `MALFORMED_RESPONSE` failure code added to the default retryable set (`retry-policy.ts`, `error.ts`), optional `id`/`name` on `tool-call-delta` (`types.ts`).
- `packages/llm/llm-deepseek/` + `packages/llm/llm-pi-ai/` — adapters stop defaulting absent tool-call ids/names to empty strings.
- `packages/core/agent-loop/` — pre-persistence guard: malformed model tool calls enter the `agent/request-error` recovery waterfall instead of durable history.
- `packages/core/session/` — `normalizeToolTranscript` repairs poisoned projections (derived history only; append-only log untouched).
- `packages/core/tools/` — registration enforces the `[A-Za-z0-9_-]{1,64}` function-name grammar.
- `packages/session/session-persistence-sqlite/src/codec.ts` — packed tool-call rows keep a required id (typed `NonNullable`), optional `name` reconstructed exactly.
- `packages/extensions/tool-cordis/src/api-catalog.ts` — regenerated public type catalog.
- `examples/acp-agent/tests/snapshots/empty-response-retry/session.jsonl` — keyless snapshot records `MALFORMED_RESPONSE` in the default retryable-code `policyKey`.
- `.agents/notes/implemented/bug-fix/2026-08-27-malformed-tool-call-recovery.md` (+ `.zh.md` / `.i18n.yaml`) — Agent Note required by upstream policy.
- Bilingual README updates in the touched packages.

## Submission checklist

- [ ] Extract the cumulative diff onto a fresh branch of `deepseek-ai/deepseek-harness`. **Do not** use the PR #54 merge diff alone (`git diff cac4f790^1..cac4f790 …`) — verified 2026-08-27 that it does not apply to the upstream tree because `core/session` / `core/agent-loop` context includes `ddabf839`. Instead, from the desktop repo:

  ```sh
  git diff <pin.sha> HEAD:vendor/deepseek-harness -- \
    packages/llm/llm packages/llm/llm-deepseek packages/llm/llm-pi-ai \
    packages/core/agent-loop packages/core/session packages/core/tools \
    packages/session/session-persistence-sqlite packages/extensions/tool-cordis \
    'examples/acp-agent/tests/snapshots/empty-response-retry' \
    '.agents/notes/implemented/bug-fix/2026-08-27-malformed-tool-call-recovery*' \
    > handoff.patch
  ```

  Verified: `git apply -p1 --check handoff.patch` is clean on the rc.1 pin tree; on rc.2 use `git apply -p1 --3way handoff.patch` — exactly 2 files conflict (`packages/llm/llm-pi-ai/tests/convert.spec.ts`, `packages/llm/llm/README.i18n.yaml`; rc.2 touched the llm packages) and resolve trivially. Add the `ddabf839` Agent Note (`.agents/notes/implemented/bug-fix/2026-08-15-tool-call-result-pairing-recovery*`) to the pathspec if upstream wants both notes in one PR, or split the two fixes into a stack.
- [ ] Run upstream gates on Node ^22.19 || >=24: `pnpm run test`, `pnpm run test:coverage` (per-file 100% on changed sources — verified locally 2026-08-27), `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`, `pnpm run test:snapshot`, `pnpm run doc-sync`.
- [ ] Run real-API gates with `DEEPSEEK_API_KEY`: `pnpm run test:e2e` (blocked in the desktop CI environment — no key).
- [ ] Open the upstream PR with one `kind/bug` label, `area/*` labels for llm / agent-loop / session / tools / session-persistence, and link the Agent Note.
- [ ] After upstream merge + release tag: update `vendor/harness-upstream.json` via `npm run sync:harness` per [2026-08-18-harness-rc7-vendor-pin.md](2026-08-18-harness-rc7-vendor-pin.md), then drop the now-redundant local fork edits if the release supersedes them.

## Known snapshot baseline caveat

The vendored tree fails 7 keyless snapshot tests on `main` that are unrelated to this fix (agent-instructions text, `read_image` vision-fallback description, escalation-approved, goal wrap-up, headless task, image-offload pin). This branch is snapshot-delta-neutral: it fails exactly the same 7. Re-record or reconcile those baselines upstream separately.
