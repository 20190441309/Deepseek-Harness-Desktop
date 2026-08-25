# @deepseek-ai/dsh-client-ui-message-edit

English | [中文](README.zh.md)

Edit-and-resend plugin, browser half: a pencil on the latest user message promotes the session's **resident bottom composer** into an edit session for that bubble — the edit surface is the real full-featured input (draft machine with reference decorations, image attachments, lexicon, the composer's Enter/Shift+Enter/IME policy, notices, resize), not a lookalike. Confirming through the composer's own send forks a child session cut *before* that message, opens the child, and hands the revised text (and any attached images) to the child's input. The original session is left untouched; the child shows up under it in the sidebar and continues from the edited prompt. Clicking the pencil does not create a session.

The pencil contributes the `edit` entry (order 10) of the `conversation.chat.user-actions` strip. The `conversation.chat.user-editor` occupant is an editing-state bubble: it arms the composer edit session on mount (`SessionInput.beginEdit` — the composer stashes the operator's half-typed draft and images, seeds the message text, focuses with the caret at the end, and paints an editing banner with its own cancel), shows the original text dimmed with a "re-editing below" hint, and offers an in-place Cancel. Both seats are declared by `ui-conversation` on the finalized user node. The pencil renders only when the addressed node is the newest `kind: 'user'` node in the transcript — historical user messages carry no edit control — and it is unavailable while the session is still running or the message contains non-text blocks (images etc.). Cancels are directional: the composer's banner cancel and IME-safe Escape keep focus in the composer, while the bubble's Cancel hands keyboard focus back to the pencil through the entries' shared interaction store. Ending the session either way restores the stashed draft and images.

The fork/open/handoff transaction is the edit session's redirected submit sink: it re-checks at confirm time that the message is still the latest and the source is idle (sending otherwise would fork a cut that silently drops the newer turns), then `sessions.fork({ sessionId, beforeSeq, increaseTitle })`, the child scope, `sessions.open(childId)`, and that scope's input facade `addImages`/`setDraft`/`submit`. A failed fork or a missing child scope returns an error outcome: the composer keeps the edit armed with the draft and announces the localized reason on its own notice channel — the revision is the operator's work, so retry and cancel both stay one gesture away.

The `/client` exports are the plugin body (`apply`/`inject`), `MessageEditAction`, and the injected face types.

## Model Experience

None, as the fork is an ordinary `session.fork` with a `beforeSeq` cut — the child inherits the source's earlier history and the model never sees the edited message twice.

#### KV Cache effect

None beyond an ordinary fork: the child starts a fresh history tail.

## Known Limitations and Deferred Work

- **Text-only entry** — a message containing images or other non-text blocks cannot be edited yet; the pencil stays visible but disabled with the reason on its tooltip. (Images *attached during* the edit do ride the confirm into the child.)
- **While running** — the control disables until the current turn settles; it does not attempt to interrupt a live turn. A session that starts running after the edit began blocks the confirm the same way.
- **Chat view only** — the trajectory and waterfall views render no user-message edit control.
- **Cancel discards the revision** — a cancelled revision is not parked anywhere; the composer restores the pre-edit draft, and reopening the edit starts again from the sent text.
