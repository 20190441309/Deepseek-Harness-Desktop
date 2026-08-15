#!/usr/bin/env node
const http = require('http');
const { encodeFrame, attachFrameReader } = require('../shared/relay-frames');

const DEFAULT_PORT = 8787;

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

class RelayServer {
  constructor() {
    this.server = null;
    this.host = null;
    this.nextId = 1;
    this.pending = new Map();
    this.upgrades = new Map();
  }

  listen(port = DEFAULT_PORT, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handleHttp(req, res);
      });
      server.on('upgrade', (req, socket, head) => {
        this.handleUpgrade(req, socket, head);
      });
      server.on('error', reject);
      server.listen(port, host, () => {
        this.server = server;
        resolve(server.address().port);
      });
    });
  }

  async close() {
    if (this.host) {
      this.host.destroy();
      this.host = null;
    }
    const server = this.server;
    this.server = null;
    if (!server) {
      return;
    }
    await new Promise((resolve) => server.close(() => resolve()));
  }

  send(header, body) {
    if (!this.host || this.host.destroyed) {
      return false;
    }
    this.host.write(encodeFrame(header, body));
    return true;
  }

  attachHost(socket) {
    if (this.host) {
      this.host.destroy();
    }
    this.host = socket;
    socket.setNoDelay(true);
    attachFrameReader(socket, (header, body) => {
      this.handleHostFrame(header, body);
    });
    socket.on('close', () => {
      if (this.host === socket) {
        this.host = null;
        for (const pending of this.pending.values()) {
          if (!pending.res.headersSent) {
            pending.res.writeHead(502);
          }
          pending.res.end('desktop disconnected');
        }
        this.pending.clear();
        for (const client of this.upgrades.values()) {
          client.destroy();
        }
        this.upgrades.clear();
      }
    });
  }

  handleHostFrame(header, body) {
    if (!header || typeof header !== 'object') {
      return;
    }
    if (header.type === 'http-head') {
      const pending = this.pending.get(header.id);
      if (pending && !pending.res.headersSent) {
        pending.res.writeHead(header.status || 502, header.headers || {});
      }
      return;
    }
    if (header.type === 'http-data') {
      const pending = this.pending.get(header.id);
      if (pending) {
        pending.res.write(body);
      }
      return;
    }
    if (header.type === 'http-end') {
      const pending = this.pending.get(header.id);
      if (pending) {
        pending.res.end();
        this.pending.delete(header.id);
      }
      return;
    }
    if (header.type === 'up-data') {
      const client = this.upgrades.get(header.id);
      if (client && !client.destroyed) {
        client.write(body);
      }
      return;
    }
    if (header.type === 'up-end') {
      const client = this.upgrades.get(header.id);
      if (client) {
        client.end();
        this.upgrades.delete(header.id);
      }
    }
  }

  async handleHttp(req, res) {
    if (!this.host) {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('桌面还没连上中继，请稍后再扫');
      return;
    }
    let body = Buffer.alloc(0);
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(413);
      res.end('request too large');
      return;
    }
    const id = this.nextId++;
    this.pending.set(id, { res });
    const ok = this.send({
      type: 'http',
      id,
      method: req.method,
      path: req.url,
      headers: req.headers,
    }, body);
    if (!ok) {
      this.pending.delete(id);
      res.writeHead(502);
      res.end('桌面还没连上中继，请稍后再扫');
    }
  }

  handleUpgrade(req, socket, head) {
    if ((req.url || '').startsWith('/__dsh__/host') && String(req.headers.upgrade || '').toLowerCase() === 'dsh-relay') {
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: dsh-relay\r\nConnection: Upgrade\r\n\r\n');
      if (head && head.length) {
        socket.unshift(head);
      }
      this.attachHost(socket);
      return;
    }
    if (!this.host) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const id = this.nextId++;
    this.upgrades.set(id, socket);
    socket.resume();
    socket.on('data', (chunk) => {
      this.send({ type: 'up-data', id }, chunk);
    });
    const end = () => {
      if (this.upgrades.get(id) === socket) {
        this.upgrades.delete(id);
        this.send({ type: 'up-end', id });
      }
    };
    socket.on('end', end);
    socket.on('close', end);
    socket.on('error', () => {
      socket.destroy();
      end();
    });
    this.send({
      type: 'upgrade',
      id,
      method: req.method,
      path: req.url,
      headers: req.headers,
    }, head && head.length ? head : Buffer.alloc(0));
  }
}

async function main(argv = process.argv.slice(2)) {
  const portFlag = argv.findIndex((item) => item === '--port');
  const port = portFlag >= 0 ? Number(argv[portFlag + 1]) : DEFAULT_PORT;
  const server = new RelayServer();
  const bound = await server.listen(Number.isInteger(port) ? port : DEFAULT_PORT);
  process.stdout.write(`dsh relay listening on ${bound}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  RelayServer,
  DEFAULT_PORT,
  main,
};
