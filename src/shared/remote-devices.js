const crypto = require('crypto');

const DEVICE_ID_BYTES = 8;

function generateDeviceId() {
  return crypto.randomBytes(DEVICE_ID_BYTES).toString('hex');
}

function deviceName(userAgent) {
  const ua = String(userAgent || '');
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Linux';
  return '手机';
}

function normalizeDevices(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const id = typeof item.id === 'string' ? item.id : '';
    const token = typeof item.token === 'string' ? item.token : '';
    if (!id || !token || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push({
      id,
      token,
      name: typeof item.name === 'string' && item.name ? item.name : '手机',
      userAgent: typeof item.userAgent === 'string' ? item.userAgent : '',
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
      lastSeenAt: typeof item.lastSeenAt === 'string' ? item.lastSeenAt : '',
    });
  }
  return out;
}

function publicDevices(devices, onlineIds) {
  const online = new Set(onlineIds || []);
  return normalizeDevices(devices).map((device) => ({
    id: device.id,
    name: device.name,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
    online: online.has(device.id),
  }));
}

function createDevice(userAgent, token) {
  const now = new Date().toISOString();
  const ua = String(userAgent || '').slice(0, 180);
  return {
    id: generateDeviceId(),
    token,
    name: deviceName(ua),
    userAgent: ua,
    createdAt: now,
    lastSeenAt: now,
  };
}

module.exports = {
  generateDeviceId,
  deviceName,
  normalizeDevices,
  publicDevices,
  createDevice,
};
