const http = require('http');
const net = require('net');
const tls = require('tls');
const { EventEmitter } = require('events');
const { encodeFrame, attachFrameReader } = require('../shared/relay-frames');
const { normalizeRelayOrigin } = require('../shared/lan');

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

const DEFAULT_RETRY_MS = 1000;
const DEFAULT_HANDSHAKE_MS = 10_000;
const MAX_RETRY_MS = 8000;
const MAX_HANDSHAKE_BYTES = 65_536;

function filterHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const name = String(key).toLowerCase();
    if (HOP_BY_HOP.has(name)) {
      continue;
    }
    out[name] = value;
  }
  return out;
}

function openSocket(target) {
  const port = Number(target.port) || (target.protocol === 'https:' ? 443 : 80);
  const host = target.hostname;
  if (target.protocol === 'https:') {
    return tls.connect({ host, port, servername: host });
  }
  return net.connect({ host, port });
}

class RelayClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.getLocal = options.getLocal || (() => null);
    this.retryMs = Number(options.retryMs) > 0 ? Number(options.retryMs) : DEFAULT_RETRY_MS;
    this.handshakeTimeoutMs = Number(options.handshakeTimeoutMs) > 0
      ? Number(options.handshakeTimeoutMs)
      : DEFAULT_HANDSHAKE_MS;
    this.socket = null;
    this.url = '';
    this.error = '';
    this.shouldRun = false;
    this.attempt = 0;
    this.reconnectTimer = null;
    this.generation = 0;
    this.tunnels = new Map();
  }

  get connected() {
    return Boolean(this.socket && !this.socket.destroyed);
  }

  snapshot() {
    return {
      connected: this.connected,
      url: this.url,
      error: this.error,
    };
  }

  async sync(relayUrl) {
    const origin = normalizeRelayOrigin(relayUrl);
    if (!origin) {
      await this.disconnect();
      return this.snapshot();
    }
    this.shouldRun = true;
    this.url = origin;
    if (this.connected && this.url === origin) {
      return this.snapshot();
    }
    this.clearReconnect();
    this.teardown();
    await this.connect(origin);
    return this.snapshot();
  }

  async connect(origin) {
    const target = new URL(origin);
    this.shouldRun = true;
    this.url = origin;
    this.error = '';
    this.clearReconnect();
    this.teardown();
    const generation = ++this.generation;
    const socket = openSocket(target);
    this.socket = socket;
    try {
      await new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (generation === this.generation) {
          this.error = error.message || String(error);
          if (this.socket === socket) {
            this.socket = null;
          }
        }
        socket.destroy();
        reject(error instanceof Error ? error : new Error(error.message || String(error)));
      };
      socket.setTimeout(this.handshakeTimeoutMs);
      socket.once('timeout', () => fail(new Error('relay handshake timeout')));
      socket.once('error', fail);
      socket.once('close', () => {
        if (!settled) {
          fail(new Error('relay handshake closed'));
        }
      });
      const onReady = () => {
        socket.write(
          `GET /__dsh__/host HTTP/1.1\r\nHost: ${target.host}\r\nConnection: Upgrade\r\nUpgrade: dsh-relay\r\n\r\n`,
        );
      };
      if (target.protocol === 'https:') {
        socket.once('secureConnect', onReady);
      } else {
        socket.once('connect', onReady);
      }
      let buf = Buffer.alloc(0);
      const onData = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        const idx = buf.indexOf('\r\n\r\n');
        if (idx < 0) {
          if (buf.length > MAX_HANDSHAKE_BYTES) {
            fail(new Error('relay handshake too large'));
          }
          return;
        }
        socket.off('data', onData);
        const head = buf.subarray(0, idx).toString('utf8');
        const rest = buf.subarray(idx + 4);
        if (!/^HTTP\/1\.\d 101\b/m.test(head)) {
          const status = (head.split(' ')[1] || '0').trim();
          fail(new Error(`relay rejected (${status})`));
          return;
        }
        if (settled) {
          return;
        }
        if (generation !== this.generation) {
          fail(new Error('relay handshake aborted'));
          return;
        }
        settled = true;
        socket.setTimeout(0);
        socket.setNoDelay(true);
        attachFrameReader(socket, (header, body) => {
          this.handleFrame(header, body);
        });
        if (rest.length) {
          socket.unshift(rest);
        }
        socket.on('close', () => {
          if (this.socket !== socket) {
            return;
          }
          this.socket = null;
          this.closeTunnels();
          this.scheduleReconnect();
        });
        socket.on('error', () => {
          socket.destroy();
        });
        this.attempt = 0;
        this.error = '';
        this.emit('connected', this.snapshot());
        resolve();
      };
      socket.on('data', onData);
      });
    } catch (error) {
      if (this.shouldRun && generation === this.generation) {
        this.scheduleReconnect();
      }
      throw error;
    }
  }

  async disconnect() {
    this.shouldRun = false;
    this.clearReconnect();
    this.teardown();
    this.url = '';
    this.error = '';
    this.attempt = 0;
  }

  teardown() {
    this.generation += 1;
    const socket = this.socket;
    this.socket = null;
    this.closeTunnels();
    if (socket) {
      socket.destroy();
    }
  }

  clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  scheduleReconnect() {
    if (!this.shouldRun || this.reconnectTimer || this.connected || !this.url) {
      return;
    }
    const delay = Math.min(this.retryMs * (2 ** this.attempt), MAX_RETRY_MS);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.shouldRun || this.connected) {
        return;
      }
      this.connect(this.url).catch(() => {
        this.scheduleReconnect();
      });
    }, delay);
  }

  closeTunnels() {
    for (const tunnel of this.tunnels.values()) {
      tunnel.destroy();
    }
    this.tunnels.clear();
  }

  send(header, body) {
    if (!this.connected) {
      return;
    }
    this.socket.write(encodeFrame(header, body));
  }

  handleFrame(header, body) {
    if (!header || typeof header !== 'object') {
      return;
    }
    if (header.type === 'http') {
      this.proxyHttp(header, body);
      return;
    }
    if (header.type === 'upgrade') {
      this.proxyUpgrade(header, body);
      return;
    }
    if (header.type === 'up-data') {
      const tunnel = this.tunnels.get(header.id);
      if (tunnel) {
        tunnel.write(body);
      }
      return;
    }
    if (header.type === 'up-end') {
      const tunnel = this.tunnels.get(header.id);
      if (tunnel) {
        tunnel.end();
        this.tunnels.delete(header.id);
      }
    }
  }

  proxyHttp(header, body) {
    const local = this.getLocal();
    const id = header.id;
    if (!local || !local.port) {
      this.send({ type: 'http-head', id, status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      this.send({ type: 'http-data', id }, Buffer.from('Harness 还没就绪'));
      this.send({ type: 'http-end', id });
      return;
    }
    const request = http.request({
      hostname: '127.0.0.1',
      port: local.port,
      path: header.path || '/',
      method: header.method || 'GET',
      headers: filterHeaders(header.headers),
    }, (upstream) => {
      this.send({
        type: 'http-head',
        id,
        status: upstream.statusCode || 502,
        headers: filterHeaders(upstream.headers),
      });
      upstream.on('data', (chunk) => {
        this.send({ type: 'http-data', id }, chunk);
      });
      upstream.on('end', () => {
        this.send({ type: 'http-end', id });
      });
    });
    request.on('error', () => {
      this.send({ type: 'http-head', id, status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      this.send({ type: 'http-data', id }, Buffer.from('中继不可达本机网关'));
      this.send({ type: 'http-end', id });
    });
    if (body && body.length) {
      request.write(body);
    }
    request.end();
  }

  proxyUpgrade(header, head = Buffer.alloc(0)) {
    const local = this.getLocal();
    const id = header.id;
    if (!local || !local.port) {
      this.send({ type: 'up-end', id });
      return;
    }
    const headers = filterHeaders(header.headers);
    headers.connection = 'Upgrade';
    if (header.headers && header.headers.upgrade) {
      headers.upgrade = header.headers.upgrade;
    }
    const lines = Object.entries(headers).map(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return values.map((item) => `${key}: ${item}`).join('\r\n');
    }).join('\r\n');
    const prelude = `${header.method || 'GET'} ${header.path || '/'} HTTP/1.1\r\n${lines}\r\n\r\n`;
    const tunnel = net.connect(local.port, '127.0.0.1', () => {
      tunnel.write(prelude);
      if (head && head.length) {
        tunnel.write(head);
      }
    });
    this.tunnels.set(id, tunnel);
    tunnel.on('data', (chunk) => {
      this.send({ type: 'up-data', id }, chunk);
    });
    const end = () => {
      if (this.tunnels.get(id) === tunnel) {
        this.tunnels.delete(id);
        this.send({ type: 'up-end', id });
      }
    };
    tunnel.on('end', end);
    tunnel.on('close', end);
    tunnel.on('error', () => {
      tunnel.destroy();
      end();
    });
  }
}

module.exports = { RelayClient };
