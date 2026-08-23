'use strict';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Accept only RemotePatch fields from the harness renderer.
 * Unknown keys fail closed so credentials and workspace cannot ride along.
 * @param {unknown} patch
 * @returns {{
 *   remoteEnabled?: boolean,
 *   remotePort?: number,
 *   remoteMode?: 'lan' | 'relay',
 *   remoteRelayUrl?: string,
 * }}
 */
function normalizeRemotePatch(patch) {
  if (!isPlainObject(patch)) {
    throw new TypeError('Remote patch must be an object');
  }
  const next = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'remoteEnabled') {
      if (typeof value !== 'boolean') {
        throw new TypeError('remoteEnabled must be a boolean');
      }
      next.remoteEnabled = value;
      continue;
    }
    if (key === 'remoteMode') {
      if (value !== 'lan' && value !== 'relay') {
        throw new TypeError('remoteMode must be lan or relay');
      }
      next.remoteMode = value;
      continue;
    }
    if (key === 'remotePort') {
      if (!Number.isInteger(value) || value < 1024 || value > 65535) {
        throw new TypeError('remotePort must be an integer from 1024 to 65535');
      }
      next.remotePort = value;
      continue;
    }
    if (key === 'remoteRelayUrl') {
      if (typeof value !== 'string' || value.length > 2048) {
        throw new TypeError('remoteRelayUrl must be a valid string');
      }
      next.remoteRelayUrl = value.trim();
      continue;
    }
    throw new Error(`Config field is not renderer-writable: ${key}`);
  }
  return next;
}

module.exports = { normalizeRemotePatch };
