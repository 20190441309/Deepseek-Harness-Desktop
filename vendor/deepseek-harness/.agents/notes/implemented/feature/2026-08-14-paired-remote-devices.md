# Agent Note: QR scan binds a long-lived phone

Status: implemented

English | [中文](2026-08-14-paired-remote-devices.zh.md)

## Problem

Scanning the Remote QR only exchanged a shared access token for a session cookie. The phone was a new anonymous visitor: closing the browser dropped the bind, the desktop had no device list, and there was no way to revoke one phone without rotating the QR for everyone.

## Decision

A successful scan mints a per-phone credential stored by the desktop shell (`remoteDevices` in its credentials file). The HttpOnly cookie carries that device token with a one-year `Max-Age`, not the QR pairing secret. Later visits from the same browser reuse the bind. The Remote popup shows **已连接设备** plus the bound count; the management dialog lists name, last seen, online (live WebSocket), and **解绑**. Unbind deletes that device and drops its sockets; the QR secret stays valid for a new scan. The popup calls `window.shell.unbindRemoteDevice`; the desktop gateway owns mint and revoke.

## Alternatives considered

**Keep one shared token as the long-term cookie.** Rejected: unbinding one phone would require rotating the QR, which kicks every phone.

**Treat each scan as a new origin and open the latest conversation as the product fix.** Rejected: the missing conversation was a symptom of having no bind. Pairing is the relationship; first-visit session selection is a separate runtime rule in [restore-latest-conversation-on-new-origin](2026-08-14-restore-latest-conversation-on-new-origin.md).

## Consequences

Re-scanning from a browser that already holds a device cookie refreshes that row instead of minting a second phone. Rotating the pairing secret does not unbind existing phones. Tests cover mint-on-login, cookie reuse, unbind returning 401, and the count/management dialog.
