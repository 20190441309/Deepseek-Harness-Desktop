const { WebSocket } = require('ws');
const { isRpcAllowed, methodFromPath } = require('../../../packages/protocol');

function joinUrl(baseUrl, pathName) {
  return `${String(baseUrl).replace(/\/$/, '')}${pathName}`;
}

function createApiProxy(getBaseUrl) {
  const sockets = new Map();

  async function handleHttp(frame) {
    const pathName = frame.path || `/api/${frame.rpcMethod || ''}`;
    if (!isRpcAllowed(pathName) && !isRpcAllowed(frame.rpcMethod)) {
      return {
        type: 'http_response',
        id: frame.id,
        status: 403,
        body: { error: 'rpc not allowed', method: methodFromPath(pathName) },
      };
    }
    const response = await fetch(joinUrl(getBaseUrl(), pathName), {
      method: frame.httpMethod || 'POST',
      headers: { 'content-type': 'application/json' },
      body: frame.body === undefined ? undefined : JSON.stringify(frame.body),
    });
    const text = await response.text();
    let parsed = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Keep the raw text when the host did not return JSON.
    }
    return {
      type: 'http_response',
      id: frame.id,
      status: response.status,
      body: parsed,
    };
  }

  function handleWsOpen(frame, send) {
    const pathName = frame.path;
    if (!isRpcAllowed(pathName)) {
      send({ type: 'ws_close', id: frame.id, reason: 'rpc not allowed' });
      return;
    }
    const socket = new WebSocket(joinUrl(getBaseUrl(), pathName).replace(/^http/, 'ws'));
    sockets.set(frame.id, socket);
    socket.on('message', (data) => {
      send({ type: 'ws_message', id: frame.id, data: String(data) });
    });
    socket.on('close', () => {
      sockets.delete(frame.id);
      send({ type: 'ws_close', id: frame.id });
    });
    socket.on('error', () => {
      sockets.delete(frame.id);
      send({ type: 'ws_close', id: frame.id, reason: 'host socket error' });
    });
  }

  function handleWsClose(frame) {
    const socket = sockets.get(frame.id);
    if (socket) {
      socket.close();
      sockets.delete(frame.id);
    }
  }

  async function dispatch(frame, send) {
    if (frame.type === 'http_request') {
      send(await handleHttp(frame));
      return;
    }
    if (frame.type === 'ws_open') {
      handleWsOpen(frame, send);
      return;
    }
    if (frame.type === 'ws_close') {
      handleWsClose(frame);
    }
  }

  function close() {
    for (const socket of sockets.values()) {
      socket.close();
    }
    sockets.clear();
  }

  return { dispatch, close };
}

module.exports = { createApiProxy };
