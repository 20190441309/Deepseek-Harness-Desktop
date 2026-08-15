# dshd-relay

Product relay for Deepseek-Harness-Desktop remote access. The desktop sidecar dials out; phones and the Expo web client dial in. The process only forwards opaque WebSocket frames. It never sees pairing tokens or RPC plaintext.

## Run locally

```powershell
npm run relay
```

Listens on `0.0.0.0:8411` by default.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DSHD_RELAY_HOST` | `0.0.0.0` | Bind address |
| `DSHD_RELAY_PORT` | `8411` | Listen port |

Health check: `GET /health` → `{"status":"ok"}`.

WebSocket path: `/ws?serverId=<id>&role=server|client&v=2`.

Daemon sockets (`role=server`) should sign the query with the Ed25519 relay-auth key. When you start the relay without a key directory it still forwards (useful for a private VPS). Put TLS in front for anything reachable from the internet.

## VPS + TLS

1. Point `relay.example.com` at the VPS.
2. Terminate TLS on Caddy / nginx / Cloudflare and proxy `/` and `/ws` to `127.0.0.1:8411`.
3. Run the relay under systemd:

```ini
[Service]
ExecStart=/usr/bin/node /opt/dshd-relay/packages/relay/bin.js
Environment=DSHD_RELAY_HOST=127.0.0.1
Environment=DSHD_RELAY_PORT=8411
Restart=always
```

4. On each desktop, set in `%APPDATA%/deepseek-harness-desktop/config.json` (or the Settings row later):

```json
{
  "relayEndpoint": "relay.example.com:443",
  "relayPublicEndpoint": "relay.example.com:443",
  "relayUseTls": true,
  "remoteAppBaseUrl": "https://app.example.com"
}
```

`relayEndpoint` is where the **desktop** dials out. `relayPublicEndpoint` is what the QR / pairing URL tells the phone. They are usually the same public hostname.

`remoteAppBaseUrl` is the Expo web origin that parses `#offer=`.

## Cloudflare later

The socket model (one daemon control socket, one data socket per client, `serverId` routing) matches a Durable Object worker. Keep this Node process until that rewrite exists. Do not copy third-party AGPL relay code into this tree.
