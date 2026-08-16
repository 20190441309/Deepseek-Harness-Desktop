# @deepseek-ai/dsh-client-ui-settings-remote

English | [中文](README.zh.md)

Desktop-only **Remote** control beside Settings. The browser plugin registers a `sidebar.footer.action` contribution with id `remote` only when Electron `window.shell` exposes `getRemote`, `saveRemote`, `rotateRemoteToken`, and `unbindRemoteDevice`. A plain `dsh web` browser has no control. The trigger and heading copy is **远程** / **Remote**. The popup exposes On/Off and LAN versus server relay as two pairs of `Button`s (selected `primary` `sm`, unselected `ghost` `sm`), the pairing QR, and a bordered connected-device row with a chevron that opens device management. Changing mode writes the local snapshot first, does not disable the On/Off buttons, and only changes the pairing QR: the LAN gateway and relay stay up while remote is on and stop only when it is off. The popup and device panel paint `--dsw-alias-bg-layer-2` so they follow glass opacity (opaque at 100%) instead of the wallpaper canvas. Ports, addresses, and the raw pairing URL stay off this face. Scanning the QR mints a long-lived per-device credential; Unbind drops that device. Device rows show the bound name, an optional OS/model/browser line parsed from the stored user-agent (never the raw UA), then short id, bound time, and last seen on separate lines. Windows, Mac, and Linux show as **电脑** with architecture in that detail line. The desktop main process owns the authenticated gateway and outbound relay. dsh remains bound to `127.0.0.1`. The pairing URL carries the secret in `#offer=` so it is not a query parameter.

The control reads and writes only through the injected desktop callbacks. It does not import another UI plugin's values. QR rendering uses the maintained `uqr` encoder inside this package. The phone glyph is dim while the gateway is off and uses the primary label color while it is on.

## Model Experience

None, as this package only configures a desktop reverse-proxy pairing flow and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Remote is desktop-only** — the control is absent in a plain browser because the gateway and token live in the Electron main process.
- **Relay origin is desktop config** — choosing Relay uses the desktop-saved relay URL; this popup does not edit that URL.
- **Bound devices live on the desktop** — the device list and Unbind call desktop IPC; rotating the QR secret does not drop already-bound devices.
