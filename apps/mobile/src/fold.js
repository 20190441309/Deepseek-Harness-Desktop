function sessionTitle(item) {
  return item?.projections?.title
    || item?.title
    || String(item?.sessionId || '').slice(0, 8)
    || '会话';
}

function foldMuxMessage(state, raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return state;
    }
  }
  const payload = parsed?.payload || parsed;
  const method = parsed?.method || payload?.type;
  const next = {
    ...state,
    events: [...(state.events || [])],
    approvals: [...(state.approvals || [])],
  };
  if (method === 'approval' || payload?.approvalId) {
    next.approvals.push({
      rpcId: parsed.rpcId,
      sessionId: payload.sessionId,
      approvalId: payload.approvalId,
      tool: payload.tool || payload.name || 'tool',
      detail: payload.detail || payload.command || payload.path || '',
    });
    return next;
  }
  const text = payload?.text || payload?.content || payload?.delta;
  if (typeof text === 'string' && text) {
    next.events.push({
      role: payload.role === 'user' ? 'user' : 'assistant',
      text,
    });
  }
  return next;
}

function rpcEnvelope(method, payload) {
  const rpcId = globalThis.crypto?.randomUUID?.() || `rpc_${Date.now()}`;
  return {
    type: 'client-request',
    rpcId,
    method,
    payload,
  };
}

function respondEnvelope(rpcId, value) {
  return {
    type: 'client-response',
    rpcId,
    result: { ok: true, value },
  };
}

module.exports = {
  sessionTitle,
  foldMuxMessage,
  rpcEnvelope,
  respondEnvelope,
};
