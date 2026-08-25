# @deepseek-ai/dsh-client-ui-message-edit

English | [中文](README.zh.md)

Edit-and-resend plugin, browser half: a pencil on the latest user message turns that bubble into an inline editor (textarea plus Cancel / Send). Confirming forks a child session cut *before* that message, opens the child, and submits the edited text. The original session is left untouched; the child shows up under it in the sidebar and continues from the edited prompt. Clicking the pencil does not create a session.

The pencil contributes the `edit` entry (order 10) of the `conversation.chat.user-actions` strip. The editor occupies `conversation.chat.user-editor`. Both seats are declared by `ui-conversation` on the finalized user node. The pencil renders only when the addressed node is the newest `kind: 'user'` node in the transcript — historical user messages carry no edit control — and it is unavailable while the session is still running or the message contains non-text blocks (images etc.). The editor keyboard matches the composer: Enter sends, Shift+Enter inserts a newline, Escape cancels, and all three are IME-safe (a composition Enter or Escape acts on the candidate list only). The editor locks Cancel / Send while its own fork-and-submit request is in flight, and blocks Send — announcing the reason beside the buttons — when the source session starts running mid-edit or a newer user message arrives (sending then would fork a cut that silently drops the newer turns). Cancelling hands keyboard focus back to the pencil through the entries' shared interaction store.

The fork/open/draft/submit transaction lives in the editor inject face: `sessions.fork({ sessionId, beforeSeq, increaseTitle })`, then the child scope, then `sessions.open(childId)`, then that scope's input facade `setDraft(text)` and `submit()`. A failed fork or a missing child scope leaves the source session selected, publishes a localized failure notice on its composer, and keeps the editor armed with the draft — the revision is the operator's work, so retry and cancel both stay one gesture away.

The `/client` exports are the plugin body (`apply`/`inject`), `MessageEditAction`, and the injected face types.

## Model Experience

None, as the fork is an ordinary `session.fork` with a `beforeSeq` cut — the child inherits the source's earlier history and the model never sees the edited message twice.

#### KV Cache effect

None beyond an ordinary fork: the child starts a fresh history tail.

## Known Limitations and Deferred Work

- **Text-only messages** — a message containing images or other non-text blocks cannot be edited yet; the pencil stays visible but disabled with the reason on its tooltip.
- **While running** — the control disables until the current turn settles; it does not attempt to interrupt a live turn. A session that starts running after the editor opened blocks Send the same way.
- **Chat view only** — the trajectory and waterfall views render no user-message edit control.
- **Cancel discards the draft** — a cancelled revision is not parked anywhere; reopening the editor starts again from the sent text.
