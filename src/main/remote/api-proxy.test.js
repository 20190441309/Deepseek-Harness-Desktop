const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApiProxy } = require('./api-proxy');

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

test('proxies an allowed session RPC to loopback', async () => {
  const host = await listen((req, res) => {
    assert.equal(req.url, '/api/session.list');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ result: { ok: true, value: { items: [] } } }));
  });
  const proxy = createApiProxy(() => host.url);
  const replies = [];
  await proxy.dispatch({
    type: 'http_request',
    id: '1',
    path: '/api/session.list',
    body: { type: 'client-request', method: 'session.list', payload: {} },
  }, (frame) => replies.push(frame));
  assert.equal(replies[0].status, 200);
  assert.deepEqual(replies[0].body.result.value, { items: [] });
  await host.close();
});

test('refuses privileged settings RPCs before they reach the host', async () => {
  let hit = false;
  const host = await listen((_req, res) => {
    hit = true;
    res.writeHead(200);
    res.end('{}');
  });
  const proxy = createApiProxy(() => host.url);
  const replies = [];
  await proxy.dispatch({
    type: 'http_request',
    id: '2',
    path: '/api/settings.describe',
    body: { type: 'client-request', method: 'settings.describe', payload: {} },
  }, (frame) => replies.push(frame));
  assert.equal(hit, false);
  assert.equal(replies[0].status, 403);
  await host.close();
});
