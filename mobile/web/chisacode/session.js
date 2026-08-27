/**
 * ChisaCode same-protocol phone session (pairing + sticky reconnect + agent list/send).
 * Replaces HTTP Host SPA login for offer v2.
 */

const SECRET_KEY = 'dsh-chisacode-device-secrets';

function loadSecrets() {
  try {
    return JSON.parse(localStorage.getItem(SECRET_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveSecret(serverId, record) {
  const all = loadSecrets();
  all[serverId] = {
    ...record,
    savedAt: Date.now(),
  };
  localStorage.setItem(SECRET_KEY, JSON.stringify(all));
}

function clearSecret(serverId) {
  const all = loadSecrets();
  delete all[serverId];
  localStorage.setItem(SECRET_KEY, JSON.stringify(all));
}

function clearAllSecrets() {
  localStorage.removeItem(SECRET_KEY);
}

function listStickyServerIds() {
  const all = loadSecrets();
  return Object.keys(all).filter((id) => all[id]?.deviceSecret && all[id]?.relayEndpoint);
}

function getMostRecentStickyServerId() {
  const all = loadSecrets();
  let bestId = '';
  let bestAt = -1;
  for (const [id, record] of Object.entries(all)) {
    if (!record?.deviceSecret || !record?.relayEndpoint) {
      continue;
    }
    const at = Number(record.savedAt) || 0;
    if (at >= bestAt) {
      bestAt = at;
      bestId = id;
    }
  }
  return bestId;
}

function clientId() {
  const key = 'dsh-chisacode-client-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `mob_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

/**
 * @param {typeof import('./daemon-client.bundle.js')} api
 * @param {object} params
 * @param {string} params.endpoint
 * @param {boolean} params.useTls
 * @param {string} params.serverId
 */
function buildClientRelayUrl(api, { endpoint, useTls, serverId }) {
  return api.buildRelayWebSocketUrl({
    endpoint,
    useTls: useTls === true,
    serverId,
    role: 'client',
  });
}

/**
 * @param {typeof import('./daemon-client.bundle.js')} api
 * @param {string} offerUrl
 * @returns {Promise<{ client: import('@chisacode/client').DaemonClient, offer: object, serverId: string }>}
 */
export async function pairFromOfferUrl(api, offerUrl) {
  const offer = api.parseConnectionOfferFromUrl(offerUrl);
  if (!offer || !offer.serverId) {
    throw new Error('无效的配对链接（需要 ChisaCode offer v2）');
  }

  const stored = loadSecrets()[offer.serverId];
  const deviceId = stored?.deviceId || api.createRelayDeviceId();
  const pairingToken = offer.authBootstrap?.pairingToken;
  const relayEndpoint = offer.relay?.endpoint;
  if (!relayEndpoint) {
    throw new Error('配对 offer 缺少中继主机');
  }

  const useTls = offer.relay?.useTls === true;

  let relayDeviceAuth;
  if (stored?.deviceSecret) {
    relayDeviceAuth = {
      version: 1,
      serverId: offer.serverId,
      deviceId: stored.deviceId,
      deviceSecret: stored.deviceSecret,
    };
  } else if (pairingToken) {
    relayDeviceAuth = {
      version: 1,
      serverId: offer.serverId,
      deviceId,
      pairingToken,
    };
  } else {
    throw new Error('需要扫码配对或已保存的设备密钥');
  }

  const url = buildClientRelayUrl(api, {
    endpoint: relayEndpoint,
    useTls,
    serverId: offer.serverId,
  });

  const client = new api.DaemonClient({
    clientId: clientId(),
    clientType: 'mobile',
    url,
    e2ee: {
      enabled: true,
      daemonPublicKeyB64: offer.daemonPublicKeyB64,
    },
    relayDeviceAuth,
    reconnect: { enabled: true },
    onRelayDeviceAuthResult: (result) => {
      if (!result?.ok || !result.deviceId || !result.deviceSecret) {
        return;
      }
      saveSecret(offer.serverId, {
        deviceId: result.deviceId,
        deviceSecret: result.deviceSecret,
        daemonPublicKeyB64: offer.daemonPublicKeyB64,
        relayEndpoint,
        useTls,
      });
    },
  });

  await client.connect();
  return { client, offer, serverId: offer.serverId };
}

/**
 * Reconnect with sticky deviceSecret (no new QR).
 * @param {typeof import('./daemon-client.bundle.js')} api
 * @param {string} serverId
 */
export async function reconnectSticky(api, serverId) {
  const stored = loadSecrets()[serverId];
  if (!stored?.deviceSecret || !stored.relayEndpoint) {
    throw new Error('没有已保存的配对；请重新扫码');
  }
  const useTls = stored.useTls === true;
  const url = buildClientRelayUrl(api, {
    endpoint: stored.relayEndpoint,
    useTls,
    serverId,
  });
  const client = new api.DaemonClient({
    clientId: clientId(),
    clientType: 'mobile',
    url,
    e2ee: {
      enabled: true,
      daemonPublicKeyB64: stored.daemonPublicKeyB64,
    },
    relayDeviceAuth: {
      version: 1,
      serverId,
      deviceId: stored.deviceId,
      deviceSecret: stored.deviceSecret,
    },
    reconnect: { enabled: true },
  });
  await client.connect();
  return { client, serverId };
}

export {
  loadSecrets,
  clearSecret,
  clearAllSecrets,
  saveSecret,
  listStickyServerIds,
  getMostRecentStickyServerId,
  buildClientRelayUrl,
};
