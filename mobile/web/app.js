import { offerFromHash, offerFromPaste } from './host/offer.js';
import { callUnary, respond } from './host/rpc.js';
import { loginWithOffer } from './host/login.js';
import { handshake } from './host/handshake.js';
import { openEventSockets } from './host/events.js';
import { applyHostFrame, hostLabel } from './host/frames.js';
import { foldEvents } from './conversation/fold.js';
import { sessionTitle } from './conversation/title.js';
import { muxPatch } from './conversation/live.js';
import { DESKTOP_ONLY_ROWS, SETTINGS_TABS, visibleScreen } from './ui/chrome.js';

const origin = window.location.origin;
const phone = document.getElementById('phone');
const screenConnect = document.getElementById('screen-connect');
const screenChat = document.getElementById('screen-chat');
const connectError = document.getElementById('connect-error');
const deviceLine = document.getElementById('device-line');
const pasteInput = document.getElementById('paste');
const chatTitle = document.getElementById('chat-title');
const runFlag = document.getElementById('run-flag');
const logEl = document.getElementById('log');
const blankEl = document.getElementById('blank');
const composer = document.getElementById('composer');
const draft = document.getElementById('draft');
const approval = document.getElementById('approval');
const approvalTitle = document.getElementById('approval-title');
const approvalCommand = document.getElementById('approval-command');
const sessionList = document.getElementById('session-list');
const workspaceLine = document.getElementById('workspace-line');
const search = document.getElementById('search');
const settings = document.getElementById('settings');
const setNav = document.getElementById('set-nav');
const options = document.getElementById('options');
const backdrop = document.getElementById('backdrop');

const memorySettings = { theme: 'light', glass: 80 };
const state = {
  connected: false,
  settingsOpen: false,
  settingsPane: '通用设置',
  sessions: [],
  sessionId: '',
  events: [],
  pendingApproval: null,
  query: '',
  host: null,
  namespaces: [],
};

let sockets = null;

function showError(message) {
  connectError.textContent = message || '';
  connectError.classList.toggle('hidden', !message);
}

function renderScreen() {
  const name = visibleScreen(state);
  screenConnect.classList.toggle('hidden', name !== 'connect');
  screenChat.classList.toggle('hidden', name !== 'chat');
  settings.classList.toggle('hidden', name !== 'settings');
}

function currentRow() {
  return state.sessions.find((row) => row.sessionId === state.sessionId);
}

function renderHeader() {
  const row = currentRow();
  chatTitle.textContent = row ? sessionTitle(row) : '新会话';
  runFlag.classList.toggle('hidden', !row?.running);
}

function renderSessions() {
  const query = state.query.trim();
  sessionList.replaceChildren(...state.sessions
    .filter((row) => !query || sessionTitle(row).includes(query))
    .map((row) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `session${row.sessionId === state.sessionId ? ' active' : ''}`;
      const title = document.createElement('b');
      title.textContent = sessionTitle(row);
      const meta = document.createElement('span');
      meta.textContent = row.running ? '运行中' : '';
      button.append(title, meta);
      button.addEventListener('click', () => {
        openSession(row.sessionId).catch((error) => showError(error.message));
      });
      return button;
    }));
}

function renderLog() {
  const rows = foldEvents(state.events);
  blankEl.classList.toggle('hidden', rows.length > 0);
  logEl.classList.toggle('hidden', rows.length === 0);
  logEl.replaceChildren(...rows.map((row) => {
    const node = document.createElement('div');
    node.className = row.role === 'user' ? 'user' : row.role === 'tool' ? 'tool' : 'assistant';
    if (row.role === 'tool') {
      const head = document.createElement('div');
      head.className = 'tool-head';
      const name = document.createElement('span');
      name.className = 'tool-name';
      name.textContent = row.text;
      const ok = document.createElement('span');
      ok.className = 'tool-ok';
      ok.textContent = row.card || '';
      head.append(name, ok);
      node.append(head);
    } else if (row.role === 'user') {
      node.textContent = row.text;
    } else {
      const paragraph = document.createElement('p');
      paragraph.textContent = row.text;
      node.append(paragraph);
    }
    return node;
  }));
  if (rows.length) {
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function renderApproval() {
  const pending = Boolean(state.pendingApproval);
  composer.classList.toggle('hidden', pending);
  approval.classList.toggle('hidden', !pending);
  if (pending) {
    approvalTitle.textContent = state.pendingApproval.title || '需要审批';
    approvalCommand.textContent = state.pendingApproval.command || '';
  }
}

function visibleNamespaceRows(namespaces) {
  return (namespaces || []).filter((item) => {
    const label = String(item?.ns || item?.title || '');
    return label && !DESKTOP_ONLY_ROWS.includes(label);
  });
}

function renderSettings(pane = state.settingsPane) {
  state.settingsPane = pane;
  setNav.replaceChildren(...SETTINGS_TABS.map((tab) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `nav-cell${tab === pane ? ' active' : ''}`;
    button.textContent = tab;
    button.addEventListener('click', () => renderSettings(tab));
    return button;
  }));
  const notice = document.createElement('p');
  notice.className = 'notice';
  notice.textContent = '远程页上的改动只留在这次连接，不会写回电脑上的 settings.yaml。';
  if (pane === '外观') {
    options.replaceChildren(notice);
    const tiles = document.createElement('div');
    tiles.className = 'tiles';
    for (const theme of ['light', 'dark']) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.dataset.theme = theme;
      tile.textContent = theme === 'light' ? '浅色' : '深色';
      tile.setAttribute('aria-pressed', String(memorySettings.theme === theme));
      tile.addEventListener('click', () => {
        memorySettings.theme = theme;
        document.documentElement.toggleAttribute('data-ds-dark-theme', theme === 'dark');
        renderSettings(pane);
      });
      tiles.append(tile);
    }
    const glassLabel = document.createElement('p');
    glassLabel.className = 'row-desc';
    glassLabel.textContent = '毛玻璃';
    const slider = document.createElement('input');
    slider.className = 'slider';
    slider.id = 'glass';
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(memorySettings.glass);
    slider.style.setProperty('--fill', `${memorySettings.glass}%`);
    slider.addEventListener('input', (event) => {
      memorySettings.glass = Number(event.target.value);
      slider.style.setProperty('--fill', `${memorySettings.glass}%`);
    });
    options.append(tiles, glassLabel, slider);
    return;
  }
  const lead = document.createElement('p');
  lead.className = 'lead';
  lead.textContent = `${pane} 跟电脑 Host 走。关闭窗口时、Harness 自动恢复和打开配置文件只在桌面端。`;
  options.replaceChildren(notice, lead);
  const rows = visibleNamespaceRows(state.namespaces);
  if (!rows.length) {
    const hint = document.createElement('p');
    hint.className = 'row-desc';
    hint.textContent = '这一栏还没有可在远程显示的 Host 项。';
    options.append(hint);
    return;
  }
  for (const item of rows) {
    const row = document.createElement('div');
    row.className = 'hair';
    const grow = document.createElement('div');
    grow.className = 'grow';
    grow.textContent = String(item.ns);
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = item.applies === 'restart' ? '需重启' : '只读';
    row.append(grow, tag);
    options.append(row);
  }
}

async function call(method, payload = {}) {
  const result = await callUnary({ origin, method, payload });
  if (!result.ok) {
    throw new Error(result.error?.message || method);
  }
  return result;
}

function sessionItems(value) {
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.sessions)) return value.sessions;
  return [];
}

function applyMux(frame) {
  const patch = muxPatch(frame, state.sessionId);
  if (!patch) return;
  if (patch.type === 'event') {
    state.events.push(patch.entry);
    renderLog();
    return;
  }
  if (patch.type === 'approval') {
    state.pendingApproval = patch.pending;
    renderApproval();
    return;
  }
  if (patch.type === 'approval-clear') {
    state.pendingApproval = null;
    renderApproval();
    return;
  }
  if (patch.type === 'title') {
    const row = currentRow();
    if (row) {
      row.projections = row.projections || { values: {} };
      row.projections.values = { ...row.projections.values, title: patch.value };
      row.blank = false;
    }
    renderHeader();
    renderSessions();
  }
}

function applyHost(frame) {
  state.sessions = applyHostFrame(state.sessions, frame?.payload);
  renderSessions();
  renderHeader();
}

async function connect(offer) {
  showError('');
  if (offer) {
    await loginWithOffer({ origin, offer });
  }
  sockets?.close();
  const session = await handshake({
    call,
    connectEvents: async () => {
      sockets = openEventSockets({ origin, onMux: applyMux, onHost: applyHost });
    },
  });
  state.connected = true;
  state.host = session.host;
  state.sessions = sessionItems(session.sessions);
  const label = hostLabel(session.host);
  deviceLine.replaceChildren();
  const live = document.createElement('span');
  live.className = 'live';
  deviceLine.append(live, label);
  if (workspaceLine) workspaceLine.textContent = label;
  try {
    const described = await callUnary({ origin, method: 'settings.describe', payload: {} });
    state.namespaces = described.ok ? (described.value?.namespaces || []) : [];
  } catch {
    state.namespaces = [];
  }
  renderSessions();
  renderScreen();
  const first = state.sessions.find((row) => !row.blank) || state.sessions[0];
  if (first?.sessionId) {
    await openSession(first.sessionId);
  }
}

async function openSession(sessionId) {
  state.sessionId = sessionId;
  phone.removeAttribute('data-drawer');
  backdrop.classList.add('hidden');
  const history = await call('session.history', { sessionId });
  state.events = history.value?.events || [];
  state.pendingApproval = null;
  const row = currentRow();
  if (row && history.value?.projections) {
    row.projections = history.value.projections;
  }
  renderHeader();
  renderSessions();
  renderLog();
  renderApproval();
}

async function createSession() {
  const created = await call('session.create', {});
  const sessionId = created.value?.sessionId;
  if (!sessionId) return;
  state.sessions = applyHostFrame(state.sessions, {
    type: 'host/session-added',
    sessionId,
    blank: true,
  });
  await openSession(sessionId);
}

async function sendPrompt(text) {
  if (!state.sessionId || !text.trim()) return;
  await call('session.prompt', {
    sessionId: state.sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: text.trim() }],
  });
  draft.value = '';
}

async function answerApproval(outcome) {
  const pending = state.pendingApproval;
  if (!pending) return;
  await respond({
    origin,
    rpcId: pending.rpcId,
    value: { sessionId: pending.sessionId, approvalId: pending.approvalId, outcome },
  });
  state.pendingApproval = null;
  renderApproval();
}

document.getElementById('enter').addEventListener('click', () => {
  connect(offerFromHash(window.location.hash)).catch((error) => {
    showError(error.message || '连接失败');
  });
});
document.getElementById('paste-enter').addEventListener('click', () => {
  const offer = offerFromPaste(pasteInput.value);
  if (!offer) {
    showError('链接无效');
    return;
  }
  connect(offer).catch((error) => showError(error.message || '连接失败'));
});
document.getElementById('menu').addEventListener('click', () => {
  phone.setAttribute('data-drawer', '');
  backdrop.classList.remove('hidden');
});
backdrop.addEventListener('click', () => {
  phone.removeAttribute('data-drawer');
  backdrop.classList.add('hidden');
});
document.getElementById('new-session').addEventListener('click', () => {
  createSession().catch((error) => showError(error.message));
});
document.getElementById('open-settings').addEventListener('click', () => {
  state.settingsOpen = true;
  renderSettings();
  renderScreen();
});
document.getElementById('close-settings').addEventListener('click', () => {
  state.settingsOpen = false;
  renderScreen();
});
search.addEventListener('input', () => {
  state.query = search.value;
  renderSessions();
});
composer.addEventListener('submit', (event) => {
  event.preventDefault();
  sendPrompt(draft.value).catch((error) => showError(error.message));
});
document.getElementById('approval-allow').addEventListener('click', () => {
  answerApproval('allowed-once').catch((error) => showError(error.message));
});
document.getElementById('approval-reject').addEventListener('click', () => {
  answerApproval('rejected').catch((error) => showError(error.message));
});

renderSettings();
renderScreen();

const bootOffer = offerFromHash(window.location.hash);
if (bootOffer) {
  connect(bootOffer).catch((error) => showError(error.message || '连接失败'));
}
