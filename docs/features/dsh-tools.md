# Feature: Harness tool-call integrity

| Field | Value |
| --- | --- |
| **id** | `dsh-tools` |
| **status** | `active` |
| **last verified** | 2026-08-27 — focused Harness unit and integration tests |

## User paths

1. A provider streams a tool call; Harness validates its call id and function name before persisting or executing it.
2. A malformed provider response enters the normal model-request recovery path without adding an assistant tool call to session history.
3. Opening an older poisoned session projects a provider-valid transcript so the next prompt can continue.

## Invariants

- Tool-call ids are non-empty and names match `[A-Za-z0-9_-]{1,64}` before a call becomes durable or executable.
- Malformed model tool calls use the retry-eligible `MALFORMED_RESPONSE` failure code.
- Transcript repair changes only the derived provider history; the append-only session log remains untouched.
- Tool registration enforces the same function-name grammar as streamed calls.

## Allowed touch

- `vendor/deepseek-harness/packages/llm/` — shared validation, adapters, retry policy, and tests.
- `vendor/deepseek-harness/packages/core/agent-loop/` — pre-persistence request-failure guard and tests.
- `vendor/deepseek-harness/packages/core/session/` — poisoned-transcript projection repair and tests.
- `vendor/deepseek-harness/packages/session/session-persistence-sqlite/src/codec.ts` — exact optional-field reconstruction for persisted tool-call chunks.
- `vendor/deepseek-harness/packages/core/tools/` — registration validation and tests.
- `vendor/deepseek-harness/packages/extensions/tool-cordis/src/api-catalog.ts` — generated public type catalog.
- `vendor/deepseek-harness/.agents/notes/` — Harness decision record.
- `docs/features/dsh-tools.md` and `docs/features/README.md` — desktop feature-spine contract.
- `.cursor/rules/dsh-tools-product.mdc` — short always-on invariants.

## Do not touch

- Electron desktop-shell startup, windows, settings, or IPC.
- Tool argument parsing, execution policy, or provider configuration beyond retry eligibility.

## Gates

| Kind | What |
| --- | --- |
| Automated | Focused Vitest suites for llm, adapters, agent-loop, session, and tools; changed-package typecheck/lint |
| Manual / QA | Existing sessions containing empty-name tool calls can send a subsequent prompt without `unknown tool ""` |

## Sources

- Root cause: provider adapters previously defaulted absent tool-call ids and names to empty strings.
- Agent Note: `vendor/deepseek-harness/.agents/notes/implemented/bug-fix/2026-08-27-malformed-tool-call-recovery.md`
- Implementation entry: `vendor/deepseek-harness/packages/llm/llm/src/assembler.ts`
