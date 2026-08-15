const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');
const failureEl = document.getElementById('failure');
const recoveryEl = document.getElementById('recovery');
const actionsEl = document.getElementById('actions');
const logEl = document.getElementById('log');
const retryEl = document.getElementById('retry');
const cancelRestartEl = document.getElementById('cancel-restart');

const HINTS = {
  idle: '等待启动。',
  starting: '正在启动本机 dsh web；关闭应用时会一并退出服务。',
  ready: '正在打开 Web UI。',
  stopping: '正在停止运行时。',
  error: '可以立即重启 Harness，或检查最近日志后调整配置。',
};

const LABELS = {
  idle: '未运行',
  starting: '正在启动运行时',
  ready: '运行时已就绪',
  stopping: '正在停止',
  error: '启动失败',
};

let latestSnapshot = null;
let countdownTimer = null;

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

function recoveryText(snapshot) {
  const recovery = snapshot?.recovery;
  if (!recovery) {
    return '';
  }
  const attempt = Number(recovery.attempt) || 0;
  const maxAttempts = Number(recovery.maxAttempts) || 0;
  if (recovery.status === 'scheduled') {
    const remaining = Math.max(0, Number(recovery.nextRetryAt) - Date.now());
    const seconds = Math.max(1, Math.ceil(remaining / 1000));
    return `${seconds} 秒后进行第 ${attempt}/${maxAttempts} 次自动重启。`;
  }
  if (recovery.status === 'restarting') {
    return `正在进行第 ${attempt}/${maxAttempts} 次自动重启。`;
  }
  if (recovery.status === 'monitoring') {
    return `第 ${attempt}/${maxAttempts} 次自动重启已完成，正在确认运行稳定。`;
  }
  if (recovery.status === 'exhausted') {
    return `已完成 ${attempt} 次自动重启，仍未稳定运行。自动恢复已停止。`;
  }
  if (recovery.status === 'cancelled') {
    return recovery.reason === 'disabled'
      ? '自动恢复已在设置中关闭。'
      : '本轮自动恢复已取消。';
  }
  return '';
}

function refreshCountdown() {
  if (!latestSnapshot) {
    return;
  }
  const text = recoveryText(latestSnapshot);
  recoveryEl.textContent = text;
  recoveryEl.hidden = !text;
}

function manageCountdown(snapshot) {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (snapshot?.recovery?.status === 'scheduled') {
    countdownTimer = setInterval(refreshCountdown, 250);
  }
}

function renderState(snapshot) {
  latestSnapshot = snapshot;
  const state = snapshot?.state || 'starting';
  const failure = snapshot?.failure;
  const recovery = snapshot?.recovery;
  const runtimeFailure = state === 'error' && failure?.phase === 'runtime';
  const recoveryBusy = recovery?.status === 'restarting';
  const recoveryScheduled = recovery?.status === 'scheduled';
  document.body.dataset.state = state;

  statusEl.textContent = state === 'error'
    ? (runtimeFailure ? 'Harness 意外退出' : 'Harness 启动失败')
    : LABELS[state] || LABELS.starting;
  statusEl.className = `status ${state}`;
  hintEl.textContent = runtimeFailure
    ? '桌面端已返回恢复页面，失效的 Web UI 和手机 Remote 已停止使用旧进程。'
    : (HINTS[state] || HINTS.starting);

  failureEl.textContent = state === 'error' ? (failure?.message || snapshot?.error || '') : '';
  failureEl.hidden = !failureEl.textContent;
  refreshCountdown();
  manageCountdown(snapshot);

  const canAct = state === 'error' || recoveryScheduled || recoveryBusy;
  actionsEl.hidden = !canAct;
  retryEl.textContent = runtimeFailure ? '立即重启' : '重试';
  retryEl.disabled = recoveryBusy;
  cancelRestartEl.hidden = !recoveryScheduled;
  cancelRestartEl.disabled = recoveryBusy;

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
  retryEl.disabled = true;
  cancelRestartEl.hidden = true;
  renderState({ state: 'starting', recovery: { status: 'inactive' } });
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
        failure: {
          phase: 'startup',
          message: error.message || String(error),
        },
      });
    });
});

cancelRestartEl.addEventListener('click', () => {
  cancelRestartEl.disabled = true;
  invoke('cancelRestart')
    .then(renderState)
    .catch((error) => {
      recoveryEl.textContent = `取消失败：${error.message || String(error)}`;
      recoveryEl.hidden = false;
      cancelRestartEl.disabled = false;
    });
});

invoke('getState')
  .then(renderState)
  .catch((error) => {
    renderState({
      state: 'error',
      error: error.message || String(error),
      failure: {
        phase: 'startup',
        message: error.message || String(error),
      },
    });
  });

listen('onState', renderState);
listen('onLog', appendLog);
if (typeof window.watchShellTheme === 'function') {
  window.watchShellTheme();
}
