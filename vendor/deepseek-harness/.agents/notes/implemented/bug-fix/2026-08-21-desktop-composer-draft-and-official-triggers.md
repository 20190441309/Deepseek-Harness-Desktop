# Agent Note: Desktop composer draft lookup and official triggers

Status: implemented

English | [中文](2026-08-21-desktop-composer-draft-and-official-triggers.zh.md)

## Problem

Files Mention, terminal Add to chat, and Browser save-into-chat write the composer through `appendToDraft`. Those plugins inject `slots`/`locale` (terminal also `layout`) and do not inject `sessions`. Reading `ctx.sessions` on that fiber throws `cannot get property "sessions" without inject`, so the write crashes. Desktop also registered a second `@` source (`name: 'path'`) beside official ui-reference, and InputBar opened a local `$` skill menu beside official `/`. The desktop Remote gateway still listened even though `ui-settings-remote` is commented out of the web-app patch.

## Decision

`appendToDraft` in ui-files, ui-preview, and ui-user-terminal reads `ctx.get('sessions')` and returns false when the service is missing. Plugin-level `inject` does not add `sessions`, so the panels still mount without a session.

ui-files does not register a `path` input-trigger source. Composer `@` is official ui-reference (`name: 'reference'`). Files Mention and `application/x-dshd-composer-mention` drag remain. dshbot's `@` member source (`name: 'dshbot'`) is unchanged.

InputBar has no `listSkillNames` and no local `$` menu. Skills use official `/` via ui-skill.

The desktop main process does not construct `RemoteGateway`. It passes `createDisabledRemote()` into HarnessController: `sync`/`stop` are no-ops and `snapshot` is `{ available: false, enabled: false, listening: false }`. `ui-settings-remote` stays commented in `packages/bundle/web-app/cordis.patch.yml`. User `remoteEnabled` on disk is not rewritten.

## Alternatives considered

**Add `sessions` to plugin `inject`.** Rejected: the Files/preview/terminal panels must mount without a session; inject would delay or fail those fibers.

**Keep the desktop `@` path menu beside ui-reference.** Rejected: two `@` sources.

**Keep the InputBar `$` menu beside official `/`.** Rejected: two skill entry points.

**Leave RemoteGateway listening while the settings row is commented.** Rejected: this version does not ship phone Remote; a silent LAN/relay listener is not a product.

## Consequences

Mention, drag, and Add to chat write the draft on a session-maybe fiber. Typing `@` no longer walks the workspace as a second source. Typing `$` does not open a skill menu. A user config with `remoteEnabled: true` does not listen until a later version starts the gateway again.

## Testing

`draft.client.spec.ts` in the three packages: `ctx.sessions` throws without inject and `ctx.get('sessions')` still writes; missing `get('sessions')` returns false. ui-files apply pins no `name: 'path'` source. InputBar pins `$fo` does not open a menuitem. `post-merge-desktop-ui.e2e.ts` clicks Mention on `note.md` and asserts `[note.md](note.md)` with an empty console tripwire, and asserts `[data-source="path"]` is absent after typing `@`. release-ui-walk requires `files.mentionAppended`. `remote.test.js` pins `createDisabledRemote` `listening !== true` and no `http.createServer`, and that `src/main/index.js` does not `new RemoteGateway`.

## Related

[Right-panel and terminal work loops](../feature/2026-08-16-surfaces-terminal-work-loops.md). [Remote pairing lives on a phone control beside Settings](../feature/2026-08-14-settings-remote-section.md). [Web file and session references](../feature/2026-07-27-web-file-and-session-references.md).
