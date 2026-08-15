#!/usr/bin/env node
const { createRelayServer } = require('./server');

const host = process.env.DSHD_RELAY_HOST || '0.0.0.0';
const port = Number(process.env.DSHD_RELAY_PORT || 8411);

const relay = createRelayServer();
relay.listen(port, host).then((address) => {
  process.stdout.write(`dshd-relay listening on ${address.host}:${address.port}\n`);
});
