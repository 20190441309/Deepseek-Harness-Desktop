# @deepseek-ai/dsh-client-ui-settings-remote

English | [中文](README.zh.md)

Desktop-only **phone Remote** control beside Settings. The browser plugin registers a `sidebar.footer.action` contribution with id `remote` only when Electron `window.shell` exposes `getRemote`, `saveRemote`, `rotateRemoteToken`, and `unbindRemoteDevice`. A plain `dsh web` browser has no control. The popup exposes on/off, LAN versus server relay, the pairing QR, and a connected-device count that opens device management. Ports, addresses, and the raw pairing URL stay off this face. Scanning the QR mints a long-lived per-phone credential; Unbind drops that phone. The desktop main process owns the authenticated gateway and outbound relay. dsh remains bound to `127.0.0.1`. The pairing URL carries the secret in `#offer=` so it is not a query parameter.

The control reads and writes only through the injected desktop callbacks. It does not import another UI plugin's values. QR rendering uses the maintained `uqr` encoder inside this package. The phone glyph is dim while the gateway is off and uses the primary label color while it is on.

## Model Experience

None, as this package only configures a desktop reverse-proxy pairing flow and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Remote is desktop-only** — the control is absent in a plain browser because the gateway and token live in the Electron main process.
- **Relay origin is desktop config** — choosing Relay uses the desktop-saved relay URL; this popup does not edit that URL.
- **Bound phones live on the desktop** — the device list and Unbind call desktop IPC; rotating the QR secret does not drop already-bound phones.
