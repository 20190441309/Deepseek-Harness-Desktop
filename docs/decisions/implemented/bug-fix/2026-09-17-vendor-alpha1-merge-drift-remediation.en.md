# Decision: adjudicate dsh-v0.1.6-alpha.1 merge drift as "upstream contract first, desktop features preserved"

Status: implemented

[中文](2026-09-17-vendor-alpha1-merge-drift-remediation.md) | English

## Problem

The vendor GUI suite failed in 16 places after the alpha.1 merge — these specs had never run on CI since the merge, and the failures mixed three kinds: upstream contracts our tree lagged behind, deliberate desktop features breaking assertions written for the old contract, and genuine code defects. Deciding each case ad hoc would conflate real regressions with upstream evolution, so a single adjudication rule was needed.

## Decision

Every failure is adjudicated as "upstream contract first, desktop features preserved": follow upstream where its contract moved, keep deliberate desktop behavior and move the spec to an equivalent assertion, and fix genuine defects as defects.

- The `dsh.workspace.view` persistence key returns to upstream `v5` (dropping the desktop-leftover `v6`, accepting a one-time view-preference reset); `WorkspaceBrowser` manual ordering goes back to upstream's summary-aware `reconcileManualOrder(…, list.byId)`, restoring arrival-order and late-blank semantics.
- The settings connection copy returns to upstream (`连接异常，刷新重试` / `重新连接中`) — the package README.zh already documents that copy; the local strings were rc.1 merge leftovers, not deliberate customization.
- Deliberate desktop features keep their implementation: the FlipText flipping label (specs now assert the accessible text with `aria-hidden` parts stripped, equivalent to the old assertion), the composer pick holding until the projection lands (specs now simulate the confirming frame before asserting enabled), managed-presentation sessions, hidden `dshbot-room`, and the `custom-instructions` settings row; upstream's `+` launcher folded the old `指令` and `添加附件` chips into one control, so the affected assertions move to the current label `添加文件或调用指令`.
- Genuine defect fixes: `ConversationContent`'s eagerly built `heroWorkspaceRow` fired the `conversation.hero.workspace` slot unconditionally (JSX child expressions evaluate at construction time), and a presentation-owned session must never instantiate the workspace picker — the row is now gated by `hero` at construction; `TerminalCleanup .stack` gains `-webkit-app-region: no-drag` (a fixed interactive-layer rule gap); the pdf-license spec untars with a relative filename on Windows (bsdtar reads a `C:` prefix as a remote host).

## Alternatives considered

- **Revert everything to upstream implementations** — rejected: FlipText, pick-hold, managed presentation, and the rest are deliberate desktop features; reverting would withdraw already accepted product behavior.
- **Loosen assertions to `toContain` or delete them** — rejected: weaker assertions would hide the next real regression of the same kind; the accessible-text assertion is equivalent to the original contract with no loss of strength.
- **Keep the `v6` persistence key** — rejected: it forks the key name from upstream permanently, and upstream already reworked the schema semantics for that key (dropping the timestamp ledger); keeping `v6` only carries the divergence into the next merge.

## Consequences

One-time cost: existing users' workspace view preferences (ordering mode and manual order) reset to defaults; no data is lost. The spec updates bind the current contracts of the desktop features — the old FlipText label stays mounted `aria-hidden` during the animation, the pick holds until the projection frame, and `conversation.hero.workspace` is no longer instantiated for presentation-owned sessions. The vendor GUI suite is green again, unblocking the `test.yml` gate so the release candidate build can proceed.
