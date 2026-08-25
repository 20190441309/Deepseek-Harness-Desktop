# dshbot

Sidebar bot contacts and group rooms for DeepSeek Harness — a **standalone
dsh plugin**. The desktop shell does not bundle or force-load it; install and
remove it like any other plugin.

## Install

In the desktop app: Settings → 插件市场 lists dshbot as a first-party row;
one click installs it through the curated catalog channel (spec below).

Through the official plugin CLI channels:

```sh
# from this repository (the marketplace row uses exactly this spec)
dsh plugin --profile web add github:ChisaAlter/Deepseek-Harness-Desktop#path:/vendor/dshbot

# once published to a registry
dsh plugin --profile web add dshbot@0.2.0

# or straight from a GitHub mirror repo
dsh plugin --profile web add github:<owner>/<repo>
```

On first load the plugin provisions its `dshbot-room` agent preset into
`$DSH_HOME/.agent-presets/` by itself (and refreshes it on upgrades), so no
host-side preset copying is required. Removing the plugin with
`dsh plugin remove dshbot` removes the sidebar tab; the desktop shell also
cleans up the preset directory when no dshbot install remains.

Desktop development: set `dshbotPreset: true` in the desktop config to have
the shell copy this workspace package into the web profile on start
(non-blocking; a failure only logs).

## What it does

- Sidebar "Bots" tab (`sidebar.nav.tab` slot): 1:1 bot contacts and group
  rooms, sessions created with `origin: 'dshbot'` (hidden from workspace
  session lists).
- Group rooms follow the Grok talking-circle contract: the room parent never
  calls a chat model; scheduling is peer-equal rounds over
  `ask_participant`, members deliver visible text only through
  `send_room_message` or `(pass)` to stay silent. A member turn is
  tool-filtered to `send_room_message` only, and the member system prompt
  says exactly that.
- A2A: `send_to_agent` messages another bot asynchronously or posts into a
  room; priority only reorders the inbox queue (no runner interrupt). Each
  1:1 bot sees a teammates/rooms directory section in its system prompt.
- `remember` appends durable notes under `$DSH_HOME/dshbot-memory/`.

Protocol symbols live in `lib/group-chat.js`; catalog/scheduling helpers in
`lib/catalog.js`; host glue in `lib/index.js`.
