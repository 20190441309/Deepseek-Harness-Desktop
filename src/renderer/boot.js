const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');
const actionsEl = document.getElementById('actions');
const logEl = document.getElementById('log');
const retryEl = document.getElementById('retry');

const HINTS = {
  idle: '等待启动。',
    starting: '正在启动本机 dsh web；关闭应用时会一并退出服务。',
  ready: '正在打开 Web UI。',
  stopping: '正在停止运行时。',
  error: '启动失败。检查 Node.js、网络，或在 Harness 设置里确认 API Key。',
};

const LABELS = {
  idle: '未运行',
  starting: '正在启动运行时',
  ready: '运行时已就绪',
  stopping: '正在停止',
  error: '启动失败',
};

function invoke(method, ...args) {
  try {
    const api = window.shell;
    if (!api || typeof api[method] !== 'function') {
      return Promise.reject(new Error('桌面壳接口不可用'));
    }
    return Promise.resolve(api[method](...args));
  } catch (error) {
    return Promise.reject(error);
  }
}

function listen(method, handler) {
  try {
    const api = window.shell;
    if (!api || typeof api[method] !== 'function') {
      return;
    }
    Promise.resolve(api[method](handler)).catch(() => {});
  } catch {
    // ignore
  }
}

function renderState(snapshot) {
  const state = snapshot?.state || 'starting';
  document.body.dataset.state = state;
  statusEl.textContent = snapshot?.error && state === 'error'
    ? snapshot.error
    : LABELS[state] || LABELS.starting;
  statusEl.className = `status ${state}`;
  hintEl.textContent = HINTS[state] || HINTS.starting;
  actionsEl.hidden = state !== 'error';

  if (Array.isArray(snapshot?.logs)) {
    logEl.replaceChildren();
    snapshot.logs.slice(-8).forEach(appendLog);
  }
}

function appendLog(line) {
  const item = document.createElement('li');
  item.textContent = typeof line === 'string' ? line : String(line ?? '');
  logEl.appendChild(item);
  while (logEl.children.length > 8) {
    logEl.removeChild(logEl.firstChild);
  }
}

retryEl.addEventListener('click', () => {
  actionsEl.hidden = true;
  renderState({ state: 'starting' });
  invoke('restart')
    .then((snapshot) => {
      if (snapshot && snapshot.state) {
        renderState(snapshot);
      }
    })
    .catch((error) => {
      renderState({
        state: 'error',
        error: error.message || String(error),
      });
    });
});

invoke('getState')
  .then(renderState)
  .catch((error) => {
    renderState({
      state: 'error',
      error: error.message || String(error),
    });
  });

listen('onState', renderState);
listen('onLog', appendLog);
if (typeof window.watchShellTheme === 'function') {
  window.watchShellTheme();
}
