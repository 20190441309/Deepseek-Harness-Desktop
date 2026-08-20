function mintRpcId() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function apiUrl(origin, path) {
  return `${String(origin || '').replace(/\/$/, '')}${path}`;
}

async function postJson({ fetchImpl, origin, path, body, signal }) {
  const fetchFn = fetchImpl || globalThis.fetch;
  const response = await fetchFn(apiUrl(origin, path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
    signal,
  });
  if (!response.ok) {
    throw new Error(`transport failure for ${path}: HTTP ${response.status}`);
  }
  return response.json();
}

async function callUnary({ fetchImpl, origin, method, payload, signal }) {
  const rpcId = mintRpcId();
  const full = await postJson({
    fetchImpl,
    origin,
    path: `/api/${method}`,
    body: { type: 'client-request', rpcId, method, payload },
    signal,
  });
  if (full?.rpcId !== rpcId) {
    throw new Error(`rpcId mismatch for ${method}: sent ${rpcId}, got ${full?.rpcId}`);
  }
  if (full?.type !== 'server-response') {
    throw new Error(`unexpected response type for ${method}`);
  }
  if (!full.result || full.result.ok !== true) {
    return { rpcId, ok: false, error: full.result?.error || { code: 'internal', message: 'request failed' } };
  }
  return { rpcId, ok: true, value: full.result.value };
}

async function respond({ fetchImpl, origin, rpcId, value, signal }) {
  return postJson({
    fetchImpl,
    origin,
    path: '/api/respond',
    body: {
      type: 'client-response',
      rpcId,
      result: { ok: true, value },
    },
    signal,
  });
}

export { mintRpcId, callUnary, respond };
