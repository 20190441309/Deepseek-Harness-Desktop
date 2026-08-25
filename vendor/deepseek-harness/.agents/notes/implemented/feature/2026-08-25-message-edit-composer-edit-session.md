# Agent Note: Message edit rides the resident composer — the composer edit session replaces the bubble textarea

Status: implemented

English | [中文](2026-08-25-message-edit-composer-edit-session.zh.md)

## Problem

The [inline editor](2026-08-15-inline-user-message-edit.md) and its [production polish](2026-08-25-message-edit-production-polish.md) put a plain textarea inside the user bubble. The product owner ruled that direction wrong: the edit surface must be the **same full-featured input as the bottom composer** — draft machine with reference decorations, image attachments, slash/mention lexicon, the composer's Enter/Shift+Enter/IME policy, notices on the composer's own channel, resize affordances — not a stripped editor that only looks similar.

The real composer cannot simply be re-mounted inside the bubble. `InputBar` is the `conversation.composer.bar` occupant, fed by the session's one input machine through the standard provide channel plus an entry-bound hooks compartment (notices, lexicon, beam, resize). A bubble-hosted copy would need a second machine and a second compartment, and `ui-message-edit` importing `InputBar` as a value is exactly the cross-plugin import the client bundle purity gate forbids.

## Decision

The resident composer itself becomes the edit surface, through a first-class **edit session** on the input facade. What still holds: the pencil renders only on the latest finalized user message and does not fork; confirm is `sessions.fork({ beforeSeq, increaseTitle: true })` → open child → submit; the source log never mutates.

**The input contract grows the edit session.** `InputEditState` (`key`, `label`) is published as `InputState.edit`; `InputEditSpec` adds the draft `seed` and the redirected `submit` sink. `SessionInput.beginEdit(spec)` stashes the operator's half-typed draft and attached images, seeds the message text, and publishes the state; `cancelEdit()` (also on `ComposerKeyboard`) restores the stash. While an edit is live, `submit()` routes to the spec's sink instead of the default send, slash adjudication is skipped (the revision is a plain message even if it starts with `/`), command claims are refused, and the persistence draft mirror is suppressed so the seeded text never overwrites the operator's saved draft. A successful sink outcome ends the session and restores the stash; an error outcome keeps the edit armed with the draft and announces on the composer's own notice channel.

**InputBar paints the session.** A banner row on the card names the edit (`edit.label`) with a cancel button; entering the session focuses the textarea with the caret at the end; Escape cancels the edit with the same IME composition guard as Enter, and is refused while the machine is mid-submit.

**The bubble occupant is now an editing-state marker.** `MessageEditEditor` arms the session on mount (`beginEdit(seq, joinedText)`), renders the original text dimmed with a "re-editing below" hint and an in-place Cancel, and restores the static bubble whenever the session ends on the composer side. Its inject face shrank to `beginEdit`/`endEdit`; the fork-open-handoff transaction moved into the spec's sink, which re-checks latest-and-idle at confirm time and hands the revision text *and images* to the child session's input.

**Focus is directional.** Composer-side cancels (banner, Escape) keep focus in the composer; the bubble's Cancel returns focus to the remounted pencil through the existing shared store handshake.

## Alternatives considered

**Host the real composer in the `user-editor` seat** (move or re-register the `conversation.composer.bar` entry there while editing). Rejected: the bar entry's hooks compartment and machine wiring are bound to the composer chain's render site; a second live mount either splits one machine across two DOM homes or duplicates it, and the sticky-composer scrollport owns the seat's geometry. The promotion keeps one machine, one mount, full parity by construction.

**Extract a shared composer body package.** Rejected: it moves half of ui-conversation's private skeleton into a shared surface for one consumer, and parity still requires duplicating the machine and compartment wiring — the part that actually makes the composer full-featured.

**Polish the bubble textarea toward parity.** Rejected by the product owner: a second simplified editor that only looks similar is explicitly disallowed.

**Disable the composer through `conversation.blocks` while editing.** Still rejected (one block per session would clobber an existing reason).

## Consequences

Parity is total because the edit surface *is* the composer: attachments, decorations, lexicon, queue/steer policy, notices, and accessibility all come along for free, now and as the composer grows. The bubble owns no editing chrome any more (no textarea, no ResizeObserver refit, no `editor.field` copy). The costs: the input contract carries three new verbs and one state field; sidebar growth still happens only at confirm (the pencil never forks); and the cancel focus semantics split by surface — composer cancels stay in the composer, bubble cancel returns to the pencil — which the web e2e pins. The facade spec pins stash/seed/restore, sink rerouting, failure re-arm, adjudication skip, claim refusal, and mirror suppression; the InputBar spec pins the banner, Escape, and the busy lock; the plugin spec pins the confirm guards and the image handoff.
