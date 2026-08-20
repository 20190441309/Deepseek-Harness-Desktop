function hostLabel(host) {
  const cwd = String(host?.cwd || '').trim().replace(/[\\/]+$/, '');
  if (!cwd) return '已连接';
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || cwd;
}

function applyHostFrame(sessions, payload) {
  const rows = Array.isArray(sessions) ? sessions.slice() : [];
  if (!payload || typeof payload !== 'object') return rows;
  if (payload.type === 'host/session-added') {
    const sessionId = payload.sessionId;
    if (!sessionId || rows.some((row) => row.sessionId === sessionId)) return rows;
    rows.unshift({
      sessionId,
      blank: payload.blank === true,
      running: false,
      cwd: payload.cwd,
      origin: payload.origin,
    });
    return rows;
  }
  if (payload.type === 'host/session-removed') {
    return rows.filter((row) => row.sessionId !== payload.sessionId);
  }
  if (payload.type === 'host/session-status') {
    return rows.map((row) => (
      row.sessionId === payload.sessionId
        ? { ...row, running: payload.running === true }
        : row
    ));
  }
  return rows;
}

export { applyHostFrame, hostLabel };
