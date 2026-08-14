# Agent Note: Remote pairing lives on a phone control beside Settings

Status: implemented

English | [中文](2026-08-14-settings-remote-section.zh.md)

## Problem

A Settings → Remote page with ports, LAN addresses, raw pairing URLs, and token rotation taught a technical pairing flow. Users need to turn remote on, pick LAN or a server relay, and scan a QR. Burying that in Settings made the control look unfinished and hid the only thing a phone user must see.

## Decision

Remote is a desktop-gated `sidebar.footer.action` (`id: 'remote'`) in `@deepseek-ai/dsh-client-ui-settings-remote`, rendered next to the Settings gear. The phone glyph uses the tertiary label color while the gateway is off and the primary label color while it is on. The popup exposes on/off, LAN versus server relay, the pairing QR, and a connected-device count that opens device management. Ports, addresses, copy, rotate, and the relay URL editor are not on this face. Registration still requires `desktopShell()` `getRemote` / `saveRemote` / `rotateRemoteToken` / `unbindRemoteDevice`. Pairing URLs put the secret in `#offer=`. A successful scan mints a long-lived per-phone credential distinct from the QR secret; Unbind drops that phone. Relay is an outbound desktop connection to the configured origin (default `http://125.124.85.212:8411`). dsh still binds `127.0.0.1`.

## Alternatives considered

**Keep the full Settings → Remote page.** Rejected: that page leaked gateway internals to every pairing. The gear remains for product settings; Remote is a phone action.

**Put the control in Electron chrome.** Rejected: the official sidebar already owns the Settings trigger; a second chrome button repeats the pairing-window mistake.

**Bind `dsh web` to `0.0.0.0` or rebuild a native chat client.** Rejected: the Host fence has no auth, and the product wraps the official page.

## Consequences

GUI tests must prove absence without `window.shell`, a dim trigger while off, a QR plus connected-device count while on, and Unbind. Main-process IPC still owns listen/token/relay/devices. The title bar and tray do not open a Remote settings section.
