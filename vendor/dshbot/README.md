# dshbot

Desktop sidebar bots and group rooms for DeepSeek Harness Desktop.

On launch the desktop shell copies this package into the web profile (same path as
dshmarket). Plain `dsh web` does not load it.

Group rooms use a host orchestrator: members deliver visible text only through the
`send_room_message` tool, or `(pass)` to skip a turn without a bubble. Bots can
asynchronously `send_to_agent` each other; priority wake is best-effort and falls
back to inbox drain on the next 1:1 turn.
