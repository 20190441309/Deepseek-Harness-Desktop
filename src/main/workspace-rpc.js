const { randomUUID } = require('crypto');

async function rpc(baseUrl, method, payload) {
  const rpcId = randomUUID();
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method,
      payload,
    }),
  });
  const body = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`RPC ${method} 返回非 JSON（HTTP ${response.status}）`);
  }
  if (!response.ok) {
    throw new Error(`RPC ${method} HTTP ${response.status}: ${body.slice(0, 240)}`);
  }
  if (parsed?.result?.ok === false) {
    const error = parsed.result.error;
    throw new Error(error?.message || `${method} 失败`);
  }
  return parsed?.result?.value;
}

async function ensureWorkspace(baseUrl, workspacePath) {
  return rpc(baseUrl, 'workspace.create', { path: workspacePath });
}

module.exports = {
  rpc,
  ensureWorkspace,
};
