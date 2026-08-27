function textFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks.map((block) => {
    if (!block || typeof block !== 'object') return '';
    if (typeof block.text === 'string') return block.text;
    return '';
  }).join('');
}

// 镜像 Android Fold.kt imagesFromBlocks：user/message 里的 image block 折叠成气泡图片。
function imagesFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  const images = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object' || block.type !== 'image') continue;
    if (typeof block.mediaType !== 'string' || typeof block.data !== 'string') continue;
    images.push({ mediaType: block.mediaType, data: block.data });
  }
  return images;
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
    const item = entry?.item;
    if (item?.type === 'user_message') {
      flushAssistant();
      rows.push({
        id: String(item.messageId || entry.seqStart || rows.length),
        role: 'user',
        text: String(item.text || ''),
        images: [],
      });
      continue;
    }
    if (item?.type === 'assistant_message' || item?.type === 'reasoning') {
      flushAssistant();
      rows.push({
        id: String(item.messageId || entry.seqStart || rows.length),
        role: 'assistant',
        text: String(item.text || ''),
      });
      continue;
    }
    if (item?.type === 'tool_call') {
      flushAssistant();
      rows.push({
        id: String(item.callId || entry.seqStart || rows.length),
        role: 'tool',
        text: String(item.name || ''),
        card: item.status || 'tool',
      });
      continue;
    }
    if (item?.type === 'error') {
      flushAssistant();
      rows.push({
        id: String(entry.seqStart || rows.length),
        role: 'assistant',
        text: String(item.message || ''),
      });
      continue;
    }
    const event = entry?.event || entry;
    if (!event || typeof event.type !== 'string') continue;
    if (event.type === 'user/message') {
      if (event.data?.source?.kind !== 'user') continue;
      flushAssistant();
      rows.push({
        id: String(event.data?.id || event.seq),
        role: 'user',
        text: textFromBlocks(event.data?.content),
        images: imagesFromBlocks(event.data?.content),
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
