const http = require('node:http');
const { WebSocketServer, WebSocket } = require('ws');
const { createConnectionId, verifyRelayAuth } = require('../protocol');

function readQuery(req) {
  const url = new URL(req.url, 'http://relay.local');
  return {
    pathname: url.pathname,
    params: Object.fromEntries(url.searchParams.entries()),
  };
}

function sendJson(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function createRelayServer(options = {}) {
  const rooms = new Map();
  const usedNonces = new Set();
  const knownServerKeys = options.knownServerKeys || null;

  function room(serverId) {
    let current = rooms.get(serverId);
    if (!current) {
      current = { control: null, clients: new Map(), data: new Map(), pending: new Map() };
      rooms.set(serverId, current);
    }
    return current;
  }

  function authorizeServer(params) {
    if (!knownServerKeys) {
      return true;
    }
    const publicKeyB64 = knownServerKeys.get(params.serverId);
    if (!publicKeyB64 || !params.relayAuthSignatureB64) {
      return false;
    }
    return verifyRelayAuth({
      serverId: params.serverId,
      role: params.role,
      connectionId: params.connectionId || '',
      nonce: params.nonce,
      issuedAt: params.issuedAt,
    }, publicKeyB64, params.relayAuthSignatureB64, Date.now(), usedNonces);
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/health/') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient(info) {
      const { params } = readQuery(info.req);
      if (!params.serverId || (params.role !== 'server' && params.role !== 'client')) {
        return false;
      }
      if (params.role === 'server' && !authorizeServer(params)) {
        return false;
      }
      return true;
    },
  });

  wss.on('connection', (ws, req) => {
    attachSocket(ws, readQuery(req).params);
  });

  function attachSocket(ws, params) {
    const current = room(params.serverId);
    if (params.role === 'server' && !params.connectionId) {
      if (current.control) {
        current.control.close();
      }
      current.control = ws;
      ws.on('close', () => {
        if (current.control === ws) {
          current.control = null;
        }
      });
      sendJson(ws, { type: 'sync', connectionIds: [...current.clients.keys()] });
      return;
    }

    if (params.role === 'server' && params.connectionId) {
      current.data.set(params.connectionId, ws);
      const queued = current.pending.get(params.connectionId) || [];
      current.pending.delete(params.connectionId);
      for (const frame of queued) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(frame);
        }
      }
      ws.on('message', (data) => {
        const client = current.clients.get(params.connectionId);
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
      ws.on('close', () => {
        current.data.delete(params.connectionId);
      });
      return;
    }

    const connectionId = createConnectionId();
    current.clients.set(connectionId, ws);
    current.pending.set(connectionId, []);
    sendJson(ws, { type: 'assigned', connectionId });
    if (current.control) {
      sendJson(current.control, { type: 'connected', connectionId });
    }
    ws.on('message', (data) => {
      const peer = current.data.get(connectionId);
      if (peer && peer.readyState === WebSocket.OPEN) {
        peer.send(data);
        return;
      }
      const queued = current.pending.get(connectionId);
      if (queued) {
        queued.push(data);
      }
    });
    ws.on('close', () => {
      current.clients.delete(connectionId);
      current.pending.delete(connectionId);
      const peer = current.data.get(connectionId);
      if (peer) {
        peer.close();
      }
      if (current.control) {
        sendJson(current.control, { type: 'disconnected', connectionId });
      }
    });
  }

  return {
    server,
    listen(port = 0, host = '127.0.0.1') {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          const address = server.address();
          resolve({ host: address.address, port: address.port });
        });
      });
    },
    async close() {
      for (const client of wss.clients) {
        client.close();
      }
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = { createRelayServer };
