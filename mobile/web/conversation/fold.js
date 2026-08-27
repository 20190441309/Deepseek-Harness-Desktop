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

const TOOL_STATUS_LABELS = {
  running: '运行中',
  completed: '完成',
  failed: '失败',
  canceled: '已取消',
};

// 每类 tool detail 折出一行摘要 + 可展开正文；未知形状保底显示类型名。
function toolDetailView(detail) {
  if (!detail || typeof detail !== 'object') return null;
  if (detail.type === 'shell') {
    return {
      summary: detail.command || '',
      body: typeof detail.output === 'string' ? detail.output : '',
      bodyKind: 'code',
    };
  }
  if (detail.type === 'read' || detail.type === 'write') {
    return {
      summary: detail.filePath || '',
      body: typeof detail.content === 'string' ? detail.content : '',
      bodyKind: 'code',
    };
  }
  if (detail.type === 'edit') {
    return {
      summary: detail.filePath || '',
      body: typeof detail.unifiedDiff === 'string' ? detail.unifiedDiff : '',
      bodyKind: 'code',
    };
  }
  if (detail.type === 'search') {
    const counts = [];
    if (Number.isInteger(detail.numMatches)) counts.push(`${detail.numMatches} 处匹配`);
    if (Number.isInteger(detail.numFiles)) counts.push(`${detail.numFiles} 个文件`);
    return {
      summary: [detail.query, counts.join(' · ')].filter(Boolean).join(' — '),
      body: typeof detail.content === 'string'
        ? detail.content
        : (detail.filePaths || []).join('\n'),
      bodyKind: 'code',
    };
  }
  if (detail.type === 'fetch') {
    return {
      summary: detail.url || '',
      body: typeof detail.result === 'string' ? detail.result : '',
      bodyKind: 'text',
    };
  }
  if (detail.type === 'sub_agent') {
    return {
      summary: detail.description || detail.subAgentType || '子智能体任务',
      body: typeof detail.log === 'string' ? detail.log : '',
      bodyKind: 'text',
      childSessionId: typeof detail.childSessionId === 'string' ? detail.childSessionId : '',
    };
  }
  if (detail.type === 'plan') {
    return { summary: '', body: detail.text || '', bodyKind: 'markdown' };
  }
  if (detail.type === 'plain_text') {
    return { summary: detail.label || '', body: detail.text || '', bodyKind: 'text' };
  }
  if (detail.type === 'worktree_setup') {
    return {
      summary: [detail.branchName, detail.worktreePath].filter(Boolean).join(' · ') || '工作树准备',
      body: typeof detail.log === 'string' ? detail.log : '',
      bodyKind: 'code',
    };
  }
  // unknown detail: keep whatever is stringable visible.
  const body = detail.output ?? detail.input ?? null;
  return {
    summary: typeof detail.type === 'string' ? detail.type : '',
    body: typeof body === 'string' ? body : (body == null ? '' : JSON.stringify(body, null, 2)),
    bodyKind: 'code',
  };
}

function foldTimelineItem(item, entry, fallbackId) {
  if (item.type === 'user_message') {
    return {
      id: String(item.messageId || entry.seqStart || fallbackId),
      role: 'user',
      text: String(item.text || ''),
      images: [],
    };
  }
  if (item.type === 'assistant_message') {
    return {
      id: String(item.messageId || entry.seqStart || fallbackId),
      role: 'assistant',
      text: String(item.text || ''),
    };
  }
  if (item.type === 'reasoning') {
    return {
      id: String(entry.seqStart || fallbackId),
      role: 'reasoning',
      text: String(item.text || ''),
    };
  }
  if (item.type === 'tool_call') {
    return {
      id: String(item.callId || entry.seqStart || fallbackId),
      role: 'tool',
      text: String(item.name || ''),
      card: TOOL_STATUS_LABELS[item.status] || item.status || 'tool',
      status: item.status || '',
      detail: toolDetailView(item.detail),
    };
  }
  if (item.type === 'error') {
    return {
      id: String(entry.seqStart || fallbackId),
      role: 'error',
      text: String(item.message || ''),
    };
  }
  if (item.type === 'todo') {
    return {
      id: String(entry.seqStart || fallbackId),
      role: 'todo',
      items: (Array.isArray(item.items) ? item.items : []).map((todo) => ({
        text: String(todo?.text || ''),
        completed: todo?.completed === true,
      })),
    };
  }
  if (item.type === 'compaction') {
    const status = item.status === 'completed'
      ? '上下文已压缩'
      : item.status === 'failed'
        ? `上下文压缩失败${item.error ? `：${item.error}` : ''}`
        : '正在压缩上下文…';
    return { id: String(entry.seqStart || fallbackId), role: 'meta', text: status };
  }
  if (item.type === 'turn_changes') {
    return {
      id: String(entry.seqStart || fallbackId),
      role: 'changes',
      text: String(item.changeSummary || ''),
      files: (Array.isArray(item.changedFiles) ? item.changedFiles : []).map((file) => ({
        path: String(file?.path || ''),
        additions: Number.isInteger(file?.additions) ? file.additions : null,
        deletions: Number.isInteger(file?.deletions) ? file.deletions : null,
      })),
    };
  }
  if (item.type === 'generative_ui') {
    return {
      id: String(entry.seqStart || fallbackId),
      role: 'meta',
      text: `交互组件「${item.title || item.componentId || 'generative UI'}」需要在电脑端查看`,
    };
  }
  // Unknown wire item types stay visible instead of silently vanishing.
  return {
    id: String(entry.seqStart || fallbackId),
    role: 'meta',
    text: `暂不支持的消息类型：${typeof item.type === 'string' ? item.type : '未知'}`,
  };
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
    if (item && typeof item === 'object' && typeof item.type === 'string') {
      flushAssistant();
      rows.push(foldTimelineItem(item, entry, rows.length));
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
        detail: null,
      });
    }
  }
  flushAssistant();
  return rows;
}

export { foldEvents, toolDetailView };
