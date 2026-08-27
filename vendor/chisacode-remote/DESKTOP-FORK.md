# chisacode-remote — Deepseek-Harness-Desktop fork

Vendored from [ChisaCode](https://github.com/ChisaAlter/ChisaCode) (`packages/{protocol,relay,server,client,highlight,cli,app}`) under **AGPL-3.0-or-later**. See `LICENSE` and `NOTICE`.

## Product role

Desktop remote pairing is the **full** ChisaCode stack:

1. `createChisaCodeDaemon` (`packages/server`) — not a hello/handshake slice
2. Cloudflare Worker relay (`packages/relay`) — self-hosted; never ship `relay.chisacode.sh` or their `account_id`
3. Protocol offer v2 + client E2EE (`packages/protocol`, `packages/client`)
4. Phone = same-protocol client (pairing / reconnect / deviceSecret store / session via `DaemonClient`)

MIT shell chrome (settings copy, Electron IPC) stays MIT. AGPL covers this tree and any modified Worker you deploy.

## Defaults (DSH)

| Knob | Env / file | Notes |
| --- | --- | --- |
| Relay host | `CHISACODE_RELAY_ENDPOINT` / `defaults.json` | **Built-in** `125.124.85.212:8411` (TLS off) |
| App base (QR URL) | `CHISACODE_APP_BASE_URL` | Same host by default |
| Home | `userData/chisacode-home` | Sticky device secrets until user 解除 |

## Packaging

- Electron main uses dynamic `import()` of ESM server exports (or `ELECTRON_RUN_AS_NODE` supervisor).
- Packaged builds: `extraResources` include this tree + production `node_modules` (see `scripts/link-chisacode-deps.mjs`).
- Corresponding source for AGPL network use: this directory in the public repo / release source archive.

## Do not

- Point production at `relay.chisacode.sh` / `app.chisacode.sh` / ChisaCode Cloudflare `account_id`
- Ship a “pairing-only” daemon stub
- Keep DSH HTTP `RemoteGateway` / offer v1 as the main phone path
