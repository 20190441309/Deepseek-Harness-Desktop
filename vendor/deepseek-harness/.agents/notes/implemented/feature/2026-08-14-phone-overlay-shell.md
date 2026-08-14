# Agent Note: Phone overlay shell for the official web UI

Status: implemented

English | [中文](2026-08-14-phone-overlay-shell.zh.md)

## Problem

The official web shell treated every viewport below 1024px as a squeezed desktop: the sidebar collapsed to a 56px rail and the concession chain still reserved that rail plus a 640px center floor. A phone-width browser or Android WebView therefore showed a rail over a crushed conversation, with no safe-area padding and no way to recover the full session list without overlapping the composer. Phone remote clients wrap this same page, so a desktop-narrow layout is the product defect, not a missing native chat UI.

## Decision

`AppFrame` introduces a stricter band under `PHONE_MAX` (768px). That band still uses the existing narrow-store toggle (`narrowExpanded` / `toggleSidebar`) so tablet auto-collapse at 1024px is unchanged. On phone the grid tracks are `0px minmax(0, 1fr) 0px`: conversation owns the frame, the sidebar paints as a left overlay drawer (`PHONE_DRAWER`, 320px, clamped to leave a backdrop strip), and an open details preference paints as a full-frame overlay. Drag handles do not mount. A floating menu button in AppFrame opens the drawer; tapping the backdrop closes it. The sidebar owner share still carries only `collapsed` and `width`; a closed phone drawer reports `width: 0` because there is no rail. Conversation header, composer, details header, and the settings panel add `max-width: 767px` safe-area and full-bleed rules. `apps/web/index.html` sets `viewport-fit=cover`.

## Alternatives considered

**Rebuild a native Android / Expo chat UI.** Rejected: the product wraps the official page; a second conversation stack would drift from tools, approvals, and theme immediately.

**Treat phone as the existing 1024px rail.** Rejected: a 56px rail on a 390px frame leaves the conversation unusable and still hides session titles.

**Widen the sidebar slot contract with `toggleSidebar` / `phone`.** Rejected: phone chrome is a shell concern; AppFrame already owns collapse. Conversation and sidebar plugins do not need a new owner field to recover a drawer.

**Bind `dsh web` to `0.0.0.0` for phone access.** Rejected: the Host fence and missing auth make an unauthenticated LAN bind unsafe. The desktop reverse proxy keeps dsh on loopback.

## Consequences

Phone and tablet are now two bands inside the same narrow store: tests must pin 390px (overlay, no handles) separately from 980px (rail). Overlay CSS lives in ui-layout; conversation and settings only add media-query insets, so a later drawer redesign does not retouch slot contracts. The cost is a second breakpoint that authors must not collapse back into `SIDEBAR_AUTO_COLLAPSE`.
