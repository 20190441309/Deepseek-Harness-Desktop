# Agent Note: Marketplace install via composer draft and install_dsh_plugin

Status: implemented

English | [中文](2026-08-15-marketplace-draft-install.zh.md)

## Problem

Settings → Plugins → Marketplace installed a GitHub plugin through Electron IPC: `dsh plugin --profile web add`, then an immediate Harness restart. The operator never sent a session message, so prepare-script risk, SHA pinning, `allowBuilds`, and the restart lived outside the conversation the rest of the product uses.

A composer draft without a Host tool still leaves the model guessing `dsh plugin add`, pnpm shims, and desktop restart. Uninstall already has a confirmation dialog and does not need that conversation.

## Decision

The Marketplace Install button closes Settings, creates a blank session in the current session's workspace (else `recentWorkspaceId`), opens it, and `setDraft`s spoken Chinese copy that includes the catalog `installSpec`. It does not `submit`. Uninstall stays the Settings one-click path.

A desktop-only Host plugin, copied into `$DSH_HOME/profiles/web/desktop-plugins/install-dsh-plugin/` and inserted by a managed `cordis.patch.yml` block, registers `install_dsh_plugin` (`spec`, optional `allowBuilds[]`). Execute POSTs to a loopback control server Electron starts on `127.0.0.1` with a random port and bearer token, passed into the Harness child as `DSH_DESKTOP_INSTALL_URL` / `DSH_DESKTOP_INSTALL_TOKEN`. The handler wraps existing `installPlugin` (SHA pin, DROPPED, pnpm shim, `allowBuilds`). Both layers validate the spec against `^github:owner/repo[#ref]$` before anything reaches `pnpm add`: the tool returns a structured failure client-side, the control endpoint answers 400 and never invokes `installPlugin`. `needsAllowBuilds` is a canonical tool result, not a thrown failure. After HTTP 200 for a successful install, Electron waits ~500ms then restarts Harness so `tool/result` can land first; the delay is a fixed grace period, not an ACK — a tool/result slower than the delay would be cut off, which is accepted rather than adding a restart protocol. The plugin is absent from the official web-app bundle. The standalone marketplace window focuses the main window and seeds the same draft; it does not call `installPlugin`.

## Alternatives considered

**Keep one-click IPC install from Settings.** Rejected: prepare scripts run on the machine with no session message naming the spec, and the operator cannot inspect or refuse the request in the composer.

**Prefill the draft and auto-submit.** Rejected: sending is the operator's confirmation; the product must not install because a catalog button was clicked.

**Prefill the draft without `install_dsh_plugin`.** Rejected: SHA pinning, the pnpm shim, `allowBuilds`, DROPPED, and restart are desktop installer details the model cannot stably reproduce with bash.

**Put the tool in the official web-app bundle.** Rejected: browser `dsh web` has no Electron installer; a Host tool there would no-op or lie. The profile patch is desktop-owned.

## Consequences

Settings no longer calls `installPlugin` for install. IPC `shell:install-plugin` remains for other desktop callers; the control channel invokes `installPlugin` in-process. Tests pin: Install seeds a draft and does not open a confirm dialog; `close` is forwarded onto `settings.plugins.tab`; the control server responds before restart; `needsAllowBuilds` does not restart; empty and non-`github:` specs fail closed at both layers without invoking the installer. The draft's blank session connects through `workspaces.connectWorkspace` — the sanctioned New Session entry — never a direct `sessions.create` (the sessions contract deliberately exposes none).
