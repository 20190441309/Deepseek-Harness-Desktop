const { randomUUID } = require('crypto');

function rpcEndpoint(baseUrl, method) {
  const endpoint = new URL(baseUrl);
  endpoint.pathname = `/api/${encodeURIComponent(method)}`;
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint.toString();
}

async function rpc(baseUrl, method, payload, fetchImpl = fetch) {
  const rpcId = randomUUID();
  const response = await fetchImpl(rpcEndpoint(baseUrl, method), {
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
  if (parsed?.type !== 'server-response' || parsed.rpcId !== rpcId || typeof parsed?.result?.ok !== 'boolean') {
    throw new Error(`RPC ${method} 返回无效响应`);
  }
  if (parsed.result.ok === false) {
    const error = parsed.result.error;
    throw new Error(error?.message || `${method} 失败`);
  }
  return parsed.result.value;
}

async function ensureWorkspace(baseUrl, workspacePath, fetchImpl = fetch) {
  return rpc(baseUrl, 'workspace.create', { path: workspacePath }, fetchImpl);
}

module.exports = {
  rpc,
  ensureWorkspace,
};
