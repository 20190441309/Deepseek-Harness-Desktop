'use strict';

const http = require('http');
const fs = require('fs');
const { resolveMobileWebRoot, resolveSpaAsset } = require('./mobile-web');

const MOBILE_WEB_PORT = 3180;

/**
 * Serve the mobile/web parity SPA for phone pairing (hash #offer= stays client-side).
 * @param {object} [options]
 * @param {string} [options.bindAddress]
 * @param {number} [options.port]
 * @param {string} [options.root]
 * @returns {import('http').Server}
 */
function createMobileWebServer(options = {}) {
  const bindAddress = String(options.bindAddress || '0.0.0.0');
  const port = Number(options.port) || MOBILE_WEB_PORT;
  const root = options.root || resolveMobileWebRoot();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const asset = resolveSpaAsset(root, url.pathname);
    if (!asset) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const headers = {
      'content-type': asset.type,
      'cache-control': /html/.test(asset.type) ? 'no-store' : 'no-cache',
    };
    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      res.end();
      return;
    }
    if (req.method !== 'GET') {
      res.writeHead(405, headers);
      res.end('Method not allowed');
      return;
    }
    res.writeHead(200, headers);
    res.end(fs.readFileSync(asset.file));
  });

  return server;
}

/**
 * Bind the mobile/web SPA server, surfacing listen errors to the caller.
 * @param {import('http').Server} server
 * @param {string} bindAddress
 * @param {number} port
 * @returns {Promise<void>}
 */
function listenMobileWebServer(server, bindAddress, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      server.removeListener('error', onError);
      server.removeListener('listening', onListening);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    if (server.listening) {
      cleanup();
      resolve();
      return;
    }
    server.listen(port, bindAddress);
  });
}

module.exports = {
  MOBILE_WEB_PORT,
  createMobileWebServer,
  listenMobileWebServer,
};
