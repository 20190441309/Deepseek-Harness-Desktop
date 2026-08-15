const fs = require('fs');
const path = require('path');
const {
  createServerId,
  generateBoxKeyPair,
  generateSignKeyPair,
} = require('../../../packages/protocol');

function emptyState() {
  const e2ee = generateBoxKeyPair();
  const relayAuth = generateSignKeyPair();
  return {
    serverId: createServerId(),
    e2ee,
    relayAuth,
    devices: [],
    pairing: null,
  };
}

function createRemoteStore(filePath) {
  let state = null;

  function load() {
    if (state) {
      return state;
    }
    try {
      state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      state = emptyState();
      save();
    }
    if (!state.serverId || !state.e2ee?.secretKeyB64 || !state.relayAuth?.secretKeyB64) {
      state = emptyState();
      save();
    }
    state.devices = Array.isArray(state.devices) ? state.devices : [];
    return state;
  }

  function save() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
    return state;
  }

  return {
    path: filePath,
    load,
    save,
    get() {
      return load();
    },
    setPairing(pairing) {
      load().pairing = pairing;
      return save();
    },
    addDevice(device) {
      const current = load();
      current.devices = current.devices.filter((item) => item.deviceId !== device.deviceId);
      current.devices.push(device);
      current.pairing = null;
      return save();
    },
    revokeDevice(deviceId) {
      const current = load();
      current.devices = current.devices.filter((item) => item.deviceId !== deviceId);
      return save();
    },
    findDevice(deviceId) {
      return load().devices.find((item) => item.deviceId === deviceId) || null;
    },
  };
}

module.exports = { createRemoteStore };
