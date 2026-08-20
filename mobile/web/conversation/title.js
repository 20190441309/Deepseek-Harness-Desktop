function sessionTitle(row) {
  if (row?.blank) return '新会话';
  const title = row?.projections?.values?.title;
  if (typeof title === 'string' && title.trim()) return title.trim();
  const id = String(row?.sessionId || '');
  return id.slice(0, 7) || '会话';
}

export { sessionTitle };
