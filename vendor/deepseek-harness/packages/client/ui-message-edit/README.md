# @deepseek-ai/dsh-client-ui-message-edit

English | [中文](README.zh.md)

Edit-and-resend plugin, browser half: a pencil in the latest user message's action strip. Clicking it forks a child session cut *before* that message (so the child carries every earlier turn but not the edited message or its old answer), opens the child, and prefills its composer with the original text. The original session is left untouched; the child shows up under it in the sidebar, and sending there resumes from the edited prompt.

The control contributes the `edit` entry (order 10) of the `conversation.chat.user-actions` strip, declared by `ui-conversation` and rendered inside the user message's IconActions row next to copy, so it inherits that row's chrome and hover behavior. It renders only when the addressed node is the newest `kind: 'user'` node in the transcript — historical user messages carry no edit control — and it is unavailable while the session is still running, while the message contains non-text blocks (images etc.), and while its own fork request is in flight.

The fork/open/prefill transaction lives in the injected face: `sessions.fork({ sessionId, beforeSeq, increaseTitle })`, then `sessions.open(childId)`, then the child scope's input facade `setDraft(text)`. A failed fork leaves the source session selected and publishes a localized failure notice on its composer.

The `/client` exports are the plugin body (`apply`/`inject`), the `MessageEditAction` component, and the injected face types.

## Model Experience

None, as the fork is an ordinary `session.fork` with a `beforeSeq` cut — the child inherits the source's earlier history and the model never sees the edited message twice.

#### KV Cache effect

None beyond an ordinary fork: the child starts a fresh history tail.

## Known Limitations and Deferred Work

- **Text-only messages** — a message containing images or other non-text blocks cannot be edited yet; the pencil stays visible but disabled with the reason on its tooltip.
- **While running** — the control disables until the current turn settles; it does not attempt to interrupt a live turn.
- **Chat view only** — the trajectory and waterfall views render no user-message edit control.
