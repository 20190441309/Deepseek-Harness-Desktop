const ALLOWED_EXACT = new Set([
  'session.list',
  'session.search',
  'session.create',
  'session.history',
  'session.models',
  'session.selectModel',
  'session.rename',
  'session.prompt',
  'session.cancel',
  'session.updateQueue',
  'host.describe',
  'workspace.list',
  'skill.list',
  'agentPreset.list',
  'agentPreset.select',
  'llm.providers',
  'llm.models',
]);

const ALLOWED_PATHS = new Set([
  '/api/respond',
  '/api/events.mux',
  '/api/events.host',
]);

const DENIED_PREFIXES = [
  'settings.',
  'credentials.',
];

const DENIED_EXACT = new Set([
  'host.pickDirectory',
  'host.openPath',
  'host.listDirectory',
  'host.createDirectory',
  'agentPreset.read',
  'agentPreset.copy',
  'agentPreset.openDocument',
  'agentPreset.remove',
  'llm.discoverModels',
  'workspace.create',
  'workspace.rename',
  'workspace.delete',
]);

function methodFromPath(path) {
  const raw = String(path || '');
  if (raw === '/api/respond' || raw === '/api/events.mux' || raw === '/api/events.host') {
    return raw;
  }
  if (raw.startsWith('/api/')) {
    return raw.slice('/api/'.length);
  }
  return raw;
}

function isRpcAllowed(methodOrPath) {
  const key = methodFromPath(methodOrPath);
  if (ALLOWED_PATHS.has(key)) {
    return true;
  }
  if (DENIED_EXACT.has(key) || DENIED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return false;
  }
  return ALLOWED_EXACT.has(key);
}

module.exports = {
  ALLOWED_EXACT,
  isRpcAllowed,
  methodFromPath,
};
