function textFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks.map((block) => {
    if (!block || typeof block !== 'object') return '';
    if (typeof block.text === 'string') return block.text;
    return '';
  }).join('');
}

function chunkText(data) {
  const chunk = data?.chunk;
  if (typeof chunk === 'string') return chunk;
  if (chunk && typeof chunk.text === 'string') return chunk.text;
  if (typeof data?.text === 'string') return data.text;
  return '';
}

function foldEvents(entries) {
  const rows = [];
  let assistant = null;
  const flushAssistant = () => {
    if (assistant) {
      rows.push(assistant);
      assistant = null;
    }
  };
  for (const entry of entries || []) {
    const event = entry?.event || entry;
    if (!event || typeof event.type !== 'string') continue;
    if (event.type === 'user/message') {
      if (event.data?.source?.kind !== 'user') continue;
      flushAssistant();
      rows.push({
        id: String(event.data?.id || event.seq),
        role: 'user',
        text: textFromBlocks(event.data?.content),
      });
      continue;
    }
    if (event.type === 'assistant/chunk') {
      if (!assistant) {
        assistant = { id: `assistant-${event.seq}`, role: 'assistant', text: '' };
      }
      assistant.text += chunkText(event.data);
      continue;
    }
    if (event.type === 'assistant/message') {
      assistant = {
        id: `assistant-${event.seq}`,
        role: 'assistant',
        text: textFromBlocks(event.data?.message?.content),
      };
      flushAssistant();
      continue;
    }
    if (event.type === 'tool/call') {
      flushAssistant();
      rows.push({
        id: String(event.data?.callId || event.seq),
        role: 'tool',
        text: String(event.data?.name || ''),
        card: entry.view?.view?.card || event.data?.name || 'tool',
      });
    }
  }
  flushAssistant();
  return rows;
}

export { foldEvents };
