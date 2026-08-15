const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { createRelayServer } = require('./server');
const {
  generateBoxKeyPair,
  generateSignKeyPair,
  sharedSecret,
  encryptJson,
  decryptJson,
  clientHello,
  daemonReady,
  relayQuery,
} = require('../protocol');

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const inbox = [];
    const waiters = [];
    socket.on('message', (data) => {
      if (waiters.length > 0) {
        waiters.shift()(data);
      } else {
        inbox.push(data);
      }
    });
    socket.nextJson = () => new Promise((resolveMsg, rejectMsg) => {
      const timer = setTimeout(() => rejectMsg(new Error('message timeout')), 3000);
      const deliver = (data) => {
        clearTimeout(timer);
        resolveMsg(JSON.parse(String(data)));
      };
      if (inbox.length > 0) {
        deliver(inbox.shift());
        return;
      }
      waiters.push(deliver);
    });
    const timer = setTimeout(() => reject(new Error('socket timeout')), 3000);
    const fail = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    socket.once('open', () => {
      clearTimeout(timer);
      socket.removeListener('error', fail);
      socket.removeListener('close', onClose);
      resolve(socket);
    });
    const onClose = () => fail(new Error('socket closed'));
    socket.once('error', fail);
    socket.once('close', onClose);
  });
}

function serverWsUrl(port, query) {
  return `ws://127.0.0.1:${port}/ws?${new URLSearchParams(query).toString()}`;
}

test('relays an e2ee echo between client and daemon without reading plaintext', async () => {
  const daemonKeys = generateBoxKeyPair();
  const clientKeys = generateBoxKeyPair();
  const signKeys = generateSignKeyPair();
  const known = new Map([['dshd_echo', signKeys.publicKeyB64]]);
  const relay = createRelayServer({ knownServerKeys: known });
  const { port } = await relay.listen(0, '127.0.0.1');
  try {
  const auth = relayQuery({
    serverId: 'dshd_echo',
    role: 'server',
    nonce: 'control-nonce',
  }, signKeys.secretKeyB64);
  const control = await openSocket(serverWsUrl(port, {
    serverId: 'dshd_echo',
    role: 'server',
    v: '2',
    nonce: auth.nonce,
    issuedAt: auth.issuedAt,
    relayAuthSignatureB64: auth.relayAuthSignatureB64,
  }));
  const sync = await control.nextJson();
  assert.deepEqual(sync, { type: 'sync', connectionIds: [] });

  const client = await openSocket(serverWsUrl(port, {
    serverId: 'dshd_echo',
    role: 'client',
    v: '2',
  }));
  const assigned = await client.nextJson();
  const connected = await control.nextJson();
  assert.equal(assigned.type, 'assigned');
  assert.equal(connected.type, 'connected');
  assert.equal(connected.connectionId, assigned.connectionId);

  const dataAuth = relayQuery({
    serverId: 'dshd_echo',
    role: 'server',
    connectionId: connected.connectionId,
    nonce: 'data-nonce',
  }, signKeys.secretKeyB64);
  const data = await openSocket(serverWsUrl(port, {
    serverId: 'dshd_echo',
    role: 'server',
    v: '2',
    connectionId: connected.connectionId,
    nonce: dataAuth.nonce,
    issuedAt: dataAuth.issuedAt,
    relayAuthSignatureB64: dataAuth.relayAuthSignatureB64,
  }));
  await new Promise((resolve) => setTimeout(resolve, 20));

  client.send(JSON.stringify(clientHello(clientKeys.publicKeyB64)));
  const hello = await data.nextJson();
  assert.equal(hello.type, 'e2ee_hello');
  data.send(JSON.stringify(daemonReady('challenge-1')));
  const ready = await client.nextJson();
  assert.equal(ready.type, 'e2ee_ready');

  const clientShared = sharedSecret(daemonKeys.publicKeyB64, clientKeys.secretKeyB64);
  const daemonShared = sharedSecret(clientKeys.publicKeyB64, daemonKeys.secretKeyB64);
  client.send(JSON.stringify(encryptJson(clientShared, { ping: 'office' })));
  const sealed = await data.nextJson();
  assert.equal(sealed.type, 'e2ee');
  assert.equal(JSON.stringify(sealed).includes('office'), false);
  assert.deepEqual(decryptJson(daemonShared, sealed), { ping: 'office' });
  } finally {
    await relay.close();
  }
});

test('rejects a daemon that cannot prove relay-auth', async () => {
  const signKeys = generateSignKeyPair();
  const known = new Map([['dshd_deny', signKeys.publicKeyB64]]);
  const relay = createRelayServer({ knownServerKeys: known });
  const { port } = await relay.listen(0, '127.0.0.1');
  try {
    await assert.rejects(
      () => openSocket(serverWsUrl(port, { serverId: 'dshd_deny', role: 'server', v: '2' })),
      /Unexpected server response|closed|ECONNRESET|socket hang up|timeout/i,
    );
  } finally {
    await relay.close();
  }
});
