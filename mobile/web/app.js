import { callUnary, respond } from './host/rpc.js';
import { handshake } from './host/handshake.js';
import { openEventSockets } from './host/events.js';
import { applyHostFrame, hostLabel } from './host/frames.js';
import { textBlock, imageBlock, promptPayload, ALLOWED_IMAGE_TYPES } from './host/prompt.js';
import { foldEvents } from './conversation/fold.js';
import { sessionTitle } from './conversation/title.js';
import { muxPatch } from './conversation/live.js';
import { visibleScreen } from './ui/chrome.js';
import {
  channelLabel,
  gitStatusLine,
  schemeIsDark,
  hostSettingsSection,
  settingsGroups,
} from './ui/settings-hub.js';
import { callShell, UnauthorizedError } from './shell/remote-shell.js';
import { parseVcsStatus, parseBranchList } from './git/vcs-parse.js';
import { resolveGitQuick } from './git/quick.js';
import { classifyScan, detectScanSupport, scanUnavailableHint } from './pair/scan.js';
import {
  agentRows,
  clearSecret,
  getMostRecentStickyServerId,
  hasOfferFragment,
  listStickyServerIds,
  pairFromOfferUrl,
  reconnectSticky,
} from './chisacode/session.js';

/** Lazy-loaded ChisaCode protocol client (DaemonClient + offer v2). */
let chisacodeApi = null;
async function loadChisaCodeApi() {
  if (!chisacodeApi) {
    chisacodeApi = await import('./chisacode/daemon-client.bundle.js');
  }
  return chisacodeApi;
}

const origin = window.location.origin;
const el = (id) => document.getElementById(id);
const phone = el('phone');
const screenConnect = el('screen-connect');
const screenScan = el('screen-scan');
const screenPermission = el('screen-permission');
const screenChat = el('screen-chat');
const connectError = el('connect-error');
const deviceLine = el('device-line');
const pasteInput = el('paste');
const scanOpen = el('scan-open');
const scanUnavailable = el('scan-unavailable');
const scanVideo = el('scan-video');
const scanTip = el('scan-tip');
const scanTorch = el('scan-torch');
const chatTitle = el('chat-title');
const hostLine = el('host-line');
const gitPill = el('git-pill');
const runFlag = el('run-flag');
const bannerEl = el('banner');
const logEl = el('log');
const blankEl = el('blank');
const composer = el('composer');
const draft = el('draft');
const attachRail = el('attach-rail');
const sendBtn = el('send-btn');
const stopBtn = el('stop-btn');
const accessChip = el('access-chip');
const approval = el('approval');
const approvalTitle = el('approval-title');
const approvalCommand = el('approval-command');
const sessionList = el('session-list');
const workspaceLine = el('workspace-line');
const search = el('search');
const settings = el('settings');
const settingsBack = el('settings-back');
const settingsTitle = el('settings-title');
const options = el('options');
const backdrop = el('backdrop');
const sheetRoot = el('sheet-root');
const dialogRoot = el('dialog-root');
const toastRoot = el('toast-root');
const lightboxRoot = el('lightbox-root');
const fileCamera = el('file-camera');
const fileGallery = el('file-gallery');

// 手机外观持久化（localStorage，对应 Android DeviceStore 的 scheme/glass/uiFont/gitTitle）。
const PHONE_KEYS = { scheme: 'dsh-phone-scheme', glass: 'dsh-phone-glass', uiFont: 'dsh-phone-ui-font', gitTitle: 'dsh-phone-git-title' };
function readPhoneStore() {
  let scheme = 'light';
  let glass = 80;
  let uiFont = '';
  let gitTitle = true;
  try {
    const rawScheme = localStorage.getItem(PHONE_KEYS.scheme);
    if (rawScheme === 'light' || rawScheme === 'dark' || rawScheme === 'system') scheme = rawScheme;
    const rawGlass = Number(localStorage.getItem(PHONE_KEYS.glass));
    if (Number.isFinite(rawGlass) && rawGlass >= 0 && rawGlass <= 100) glass = rawGlass;
    uiFont = localStorage.getItem(PHONE_KEYS.uiFont) || '';
    if (localStorage.getItem(PHONE_KEYS.gitTitle) === 'false') gitTitle = false;
  } catch { /* storage unavailable → session memory */ }
  return { scheme, glass, uiFont, gitTitle };
}
function persistPhoneStore(key, value) {
  try {
    localStorage.setItem(PHONE_KEYS[key], String(value));
  } catch { /* ignore */ }
}

const store = readPhoneStore();
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

const state = {
  route: 'connect',
  connected: false,
  settingsOpen: false,
  settingsPane: '',
  sessions: [],
  sessionId: '',
  events: [],
  pendingApproval: null,
  query: '',
  host: null,
  hostName: '已连接',
  cwd: '',
  running: false,
  banner: '',
  attachments: [],
  lightbox: null,
  attachOpen: false,
  accessMode: '只读',
  gitStatus: parseVcsStatus(null),
  gitBusy: false,
  gitToast: '',
  gitDialog: '',
  gitConfirmAction: '',
  branches: [],
  branchQuery: '',
  newBranchName: '',
  commitMessage: '',
  wsTab: 'changes',
  fileQuery: '',
  fileEntries: [],
  scanSupport: { supported: false, reason: '' },
  transport: '',
  chisacode: null,
};

let sockets = null;
let scanStream = null;
let scanLoopId = 0;
let torchOn = false;
let toastTimer = 0;

function applyAppearance() {
  const dark = schemeIsDark(store.scheme, darkQuery.matches);
  document.documentElement.toggleAttribute('data-ds-dark-theme', dark);
  document.documentElement.style.setProperty('--dsw-alias-glass-opacity', `${store.glass}%`);
  if (store.uiFont.trim()) {
    document.documentElement.style.setProperty('--dsw-font-family', `${store.uiFont.trim()}, -apple-system, sans-serif`);
  } else {
    document.documentElement.style.removeProperty('--dsw-font-family');
  }
}
darkQuery.addEventListener?.('change', () => {
  if (store.scheme === 'system') applyAppearance();
});

function showError(message) {
  connectError.textContent = message || '';
  connectError.classList.toggle('hidden', !message);
}

function showBanner(message) {
  state.banner = message || '';
  bannerEl.textContent = state.banner;
  bannerEl.classList.toggle('hidden', !state.banner);
}

function renderScreen() {
  const name = visibleScreen(state);
  screenConnect.classList.toggle('hidden', name !== 'connect');
  screenScan.classList.toggle('hidden', name !== 'scan');
  screenPermission.classList.toggle('hidden', name !== 'permission');
  screenChat.classList.toggle('hidden', name !== 'chat');
  settings.classList.toggle('hidden', !(name === 'chat' && state.settingsOpen));
}

function currentRow() {
  return state.sessions.find((row) => row.sessionId === state.sessionId);
}

function syncRunning() {
  state.running = currentRow()?.running === true;
  runFlag.classList.toggle('hidden', !state.running);
  sendBtn.classList.toggle('hidden', state.running);
  stopBtn.classList.toggle('hidden', !state.running);
}

function renderComposer() {
  const canSend = Boolean(draft.value.trim()) || state.attachments.length > 0;
  sendBtn.disabled = !canSend;
  accessChip.firstChild.textContent = state.accessMode;
  attachRail.classList.toggle('hidden', state.attachments.length === 0);
  attachRail.replaceChildren(...state.attachments.map((image, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'attach-thumb';
    const img = document.createElement('img');
    img.src = `data:${image.mediaType};base64,${image.data}`;
    img.alt = '附件图片';
    img.addEventListener('click', () => {
      state.lightbox = image;
      renderLightbox();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'attach-remove';
    remove.setAttribute('aria-label', '移除附件');
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      state.attachments.splice(index, 1);
      if (state.lightbox && !state.attachments.includes(state.lightbox)) {
        state.lightbox = null;
        renderLightbox();
      }
      renderComposer();
    });
    wrap.append(img, remove);
    return wrap;
  }));
}

function renderHeader() {
  const row = currentRow();
  chatTitle.textContent = row ? sessionTitle(row) : '新会话';
  hostLine.textContent = state.hostName;
  const showPill = store.gitTitle && state.gitStatus.refName != null;
  gitPill.classList.toggle('hidden', !showPill);
  if (showPill) {
    gitPill.textContent = `${state.gitStatus.refName} · ${state.gitStatus.aheadCount}`;
  }
  syncRunning();
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
        openSession(row.sessionId).catch((error) => showBanner(error.message));
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
      if (row.images?.length) {
        const gallery = document.createElement('div');
        gallery.className = 'bubble-images';
        for (const image of row.images) {
          const img = document.createElement('img');
          img.className = row.images.length === 1 ? 'solo' : 'multi';
          img.src = `data:${image.mediaType};base64,${image.data}`;
          img.alt = '消息图片';
          img.addEventListener('click', () => {
            state.lightbox = image;
            renderLightbox();
          });
          gallery.append(img);
        }
        node.append(gallery);
      }
      if (row.text) {
        const text = document.createElement('span');
        text.textContent = row.text;
        node.append(text);
      }
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

// —— 主机 RPC / shell —— //

const LEGACY_HOST_RPC_MSG = '当前为 ChisaCode 配对会话，旧 Host RPC 已退役';

function assertNotLegacyHostRpc() {
  if (state.transport === 'chisacode') {
    throw new Error(LEGACY_HOST_RPC_MSG);
  }
}

async function call(method, payload = {}) {
  assertNotLegacyHostRpc();
  const result = await callUnary({ origin, method, payload });
  if (!result.ok) {
    throw new Error(result.error?.message || method);
  }
  return result;
}

function forceLogout(message) {
  const serverId = state.chisacode?.serverId;
  try {
    state.chisacode?.dispose?.();
    const closing = state.chisacode?.client?.close?.();
    if (closing && typeof closing.catch === 'function') {
      void closing.catch(() => {});
    }
  } catch { /* ignore */ }
  if (state.transport === 'chisacode' && serverId) {
    clearSecret(serverId);
  }
  sockets?.close();
  sockets = null;
  state.connected = false;
  state.transport = '';
  state.chisacode = null;
  state.route = 'connect';
  state.sessions = [];
  state.sessionId = '';
  state.events = [];
  state.settingsOpen = false;
  state.settingsPane = '';
  state.gitDialog = '';
  showBanner('');
  renderSheet();
  renderDialog();
  renderScreen();
  showError(message || '');
}

async function shell(name, payload = {}) {
  assertNotLegacyHostRpc();
  try {
    return await callShell({ origin, name, payload });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      forceLogout('登录已失效');
    }
    throw error;
  }
}

// —— 事件流 —— //

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

function sessionItems(value) {
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.sessions)) return value.sessions;
  return [];
}

function updateChisaCodeAgent(agent) {
  const next = agentRows({ entries: [{ agent }] })[0];
  if (!next) return;
  const index = state.sessions.findIndex(row => row.sessionId === next.sessionId);
  if (index >= 0) {
    state.sessions[index] = next;
  } else {
    state.sessions.unshift(next);
  }
  if (state.sessionId === next.sessionId) {
    state.cwd = next.cwd;
  }
  renderSessions();
  renderHeader();
}

function bindChisaCodeEvents(paired) {
  const disposers = [];
  if (typeof paired.client.on !== 'function') {
    return () => {};
  }
  disposers.push(paired.client.on('agent_update', (message) => {
    const update = message?.payload;
    if (update?.kind === 'upsert') {
      updateChisaCodeAgent(update.agent);
    } else if (update?.kind === 'remove') {
      state.sessions = state.sessions.filter(row => row.sessionId !== update.agentId);
      renderSessions();
      renderHeader();
    }
  }));
  disposers.push(paired.client.on('agent_stream', (message) => {
    const payload = message?.payload;
    if (!payload || payload.agentId !== state.sessionId) return;
    const event = payload.event;
    if (event?.type === 'timeline') {
      state.events.push({
        item: event.item,
        timestamp: payload.timestamp,
        seqStart: payload.seq,
        seqEnd: payload.seq,
      });
      renderLog();
    }
    const row = currentRow();
    if (row && event?.type === 'turn_started') row.running = true;
    if (row && ['turn_completed', 'turn_failed', 'turn_canceled'].includes(event?.type)) {
      row.running = false;
    }
    if (event?.type === 'permission_requested') {
      state.pendingApproval = {
        requestId: event.request?.id,
        title: event.request?.title || event.request?.name || '需要审批',
        command: event.request?.description || '',
      };
      renderApproval();
    }
    renderHeader();
  }));
  return () => {
    for (const dispose of disposers) {
      if (typeof dispose === 'function') dispose();
    }
  };
}

async function finishChisaCodeConnect(paired, reconnected) {
  paired.dispose = bindChisaCodeEvents(paired);
  state.chisacode = paired;
  state.transport = 'chisacode';
  state.connected = true;
  state.route = 'chat';
  state.host = { protocol: 'chisacode-v2', serverId: paired.serverId };
  state.cwd = '';
  state.hostName = paired.serverId;
  try {
    state.sessions = agentRows(await paired.client.fetchAgents({
      page: { limit: 100 },
      subscribe: {},
    }));
  } catch {
    state.sessions = [];
  }
  deviceLine.replaceChildren();
  deviceLine.append(document.createTextNode(`${reconnected ? '已重连' : '已配对'} ${paired.serverId}`));
  showBanner('');
  renderSessions();
  renderHeader();
  renderScreen();
}

async function connect(offerUrl) {
  showError('');
  if (!hasOfferFragment(offerUrl)) {
    throw new Error('请使用桌面端扫码配对二维码（ChisaCode offer）');
  }
  const api = await loadChisaCodeApi();
  await finishChisaCodeConnect(await pairFromOfferUrl(api, offerUrl), false);
}

async function connectSticky() {
  const serverId = getMostRecentStickyServerId();
  if (!serverId) {
    throw new Error('没有已保存的配对；请重新扫码');
  }
  const api = await loadChisaCodeApi();
  await finishChisaCodeConnect(await reconnectSticky(api, serverId), true);
}

async function openSession(sessionId) {
  state.sessionId = sessionId;
  phone.removeAttribute('data-drawer');
  backdrop.classList.add('hidden');
  if (state.transport === 'chisacode') {
    const history = await state.chisacode.client.fetchAgentTimeline(sessionId, {
      direction: 'tail',
      limit: 200,
      projection: 'projected',
    });
    state.events = Array.isArray(history?.entries) ? history.entries : [];
    if (history?.agent) updateChisaCodeAgent(history.agent);
    const pending = history?.agent?.pendingPermissions?.[0];
    state.pendingApproval = pending
      ? {
          requestId: pending.id,
          title: pending.title || pending.name || '需要审批',
          command: pending.description || '',
        }
      : null;
    state.cwd = currentRow()?.cwd || '';
    renderHeader();
    renderSessions();
    renderLog();
    renderApproval();
    return;
  }
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
  if (state.transport === 'chisacode') {
    throw new Error('请先在电脑端新建会话；手机端可继续已有 ChisaCode 会话');
  }
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

async function sendPrompt() {
  const text = draft.value.trim();
  const images = state.attachments.slice();
  if (!state.sessionId || (!text && !images.length)) return;
  if (state.pendingApproval) return;
  if (state.transport === 'chisacode') {
    await state.chisacode.client.sendAgentMessage(
      state.sessionId,
      text || '请查看附件',
      {
        images: images.map(image => ({
          data: image.data,
          mimeType: image.mediaType,
        })),
      },
    );
    draft.value = '';
    state.attachments = [];
    const row = currentRow();
    if (row) row.running = true;
    renderComposer();
    renderHeader();
    return;
  }
  const blocks = [];
  if (text) blocks.push(textBlock(text));
  for (const image of images) {
    blocks.push({ type: 'image', mediaType: image.mediaType, data: image.data });
  }
  await call('session.prompt', { sessionId: state.sessionId, ...promptPayload(blocks) });
  draft.value = '';
  state.attachments = [];
  renderComposer();
}

async function cancelRun() {
  if (!state.sessionId) return;
  try {
    if (state.transport === 'chisacode') {
      await state.chisacode.client.cancelAgent(state.sessionId);
      return;
    }
    await call('session.cancel', { sessionId: state.sessionId });
  } catch (error) {
    showBanner(error.message || '无法停止');
  }
}

async function answerApproval(outcome) {
  const pending = state.pendingApproval;
  if (!pending) return;
  if (state.transport === 'chisacode') {
    await state.chisacode.client.respondToPermission(
      state.sessionId,
      pending.requestId,
      { behavior: outcome.startsWith('allowed') ? 'allow' : 'deny' },
    );
    state.pendingApproval = null;
    renderApproval();
    return;
  }
  assertNotLegacyHostRpc();
  await respond({
    origin,
    rpcId: pending.rpcId,
    value: { sessionId: pending.sessionId, approvalId: pending.approvalId, outcome },
  });
  state.pendingApproval = null;
  renderApproval();
}

// —— 扫码（M2）—— //

async function initScanButton() {
  state.scanSupport = await detectScanSupport({
    isSecureContext: window.isSecureContext,
    mediaDevices: navigator.mediaDevices,
    BarcodeDetector: window.BarcodeDetector,
  });
  scanOpen.classList.toggle('hidden', !state.scanSupport.supported);
  const hint = scanUnavailableHint(state.scanSupport.reason);
  scanUnavailable.textContent = hint;
  scanUnavailable.classList.toggle('hidden', !hint);
}

function stopScan() {
  scanLoopId += 1;
  for (const track of scanStream?.getTracks?.() || []) {
    track.stop();
  }
  scanStream = null;
  scanVideo.srcObject = null;
  torchOn = false;
}

function closeScan() {
  stopScan();
  state.route = 'connect';
  renderScreen();
}

function handleScanHit(raw) {
  const outcome = classifyScan(raw, origin);
  if (outcome.kind === 'invalid') {
    scanTip.textContent = '二维码里没有配对密钥，请扫桌面远程弹窗里的二维码';
    return false;
  }
  stopScan();
  if (outcome.kind === 'navigate') {
    window.location.replace(outcome.url);
    return true;
  }
  state.route = 'connect';
  renderScreen();
  connect(outcome.offerUrl).catch((error) => {
    showError(error.message || '连接失败');
  });
  return true;
}

async function startScan() {
  if (!state.scanSupport.supported) return;
  state.route = 'scan';
  scanTip.textContent = '将二维码放入框内';
  scanTorch.classList.add('hidden');
  renderScreen();
  let detector;
  try {
    detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
  } catch (error) {
    stopScan();
    if (error?.name === 'NotAllowedError') {
      state.route = 'permission';
    } else {
      state.route = 'connect';
      showError(error?.message || '无法打开相机');
    }
    renderScreen();
    return;
  }
  scanVideo.srcObject = scanStream;
  try {
    await scanVideo.play();
  } catch { /* autoplay policy — video attr covers it */ }
  const track = scanStream.getVideoTracks()[0];
  if (track?.getCapabilities?.().torch) {
    scanTorch.classList.remove('hidden');
    scanTorch.textContent = '手电筒';
  }
  const loop = scanLoopId += 1;
  let lastDetect = 0;
  const step = async (now) => {
    if (loop !== scanLoopId) return;
    if (now - lastDetect >= 200 && scanVideo.readyState >= 2) {
      lastDetect = now;
      try {
        const codes = await detector.detect(scanVideo);
        if (loop !== scanLoopId) return;
        const raw = codes.find((code) => code.rawValue)?.rawValue;
        if (raw && handleScanHit(raw)) return;
      } catch { /* 单帧解码失败继续扫 */ }
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function toggleTorch() {
  const track = scanStream?.getVideoTracks?.()[0];
  if (!track) return;
  try {
    torchOn = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    scanTorch.textContent = torchOn ? '关闭手电' : '手电筒';
  } catch {
    torchOn = false;
    scanTorch.classList.add('hidden');
  }
}

// —— 附件（M3）—— //

function base64FromDataUrl(dataUrl) {
  const index = dataUrl.indexOf(',');
  return index >= 0 ? dataUrl.slice(index + 1) : '';
}

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

async function compressImage(file) {
  // 与 Android TakePicturePreview→JPEG 88% 同量级：大图经 canvas 转 JPEG。
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return { mediaType: 'image/jpeg', data: base64FromDataUrl(canvas.toDataURL('image/jpeg', 0.88)) };
}

async function attachmentFromFile(file) {
  if (ALLOWED_IMAGE_TYPES.includes(file.type) && file.size <= MAX_IMAGE_BYTES) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const block = imageBlock(file.type, bytes);
    return { mediaType: block.mediaType, data: block.data };
  }
  // 非白名单类型（如 HEIC）或大图统一经 canvas 转 JPEG。
  return compressImage(file);
}

async function addFiles(fileList) {
  for (const file of Array.from(fileList || [])) {
    try {
      state.attachments.push(await attachmentFromFile(file));
    } catch (error) {
      showBanner(error.message || '无法读取图片');
    }
  }
  renderComposer();
}

// —— Git / 工作区（M5）—— //

function currentQuick() {
  return resolveGitQuick(state.gitStatus, state.gitBusy);
}

async function refreshGit() {
  if (!state.cwd) return;
  try {
    const result = await shell('gitStatus', { cwd: state.cwd });
    state.gitStatus = parseVcsStatus(result);
  } catch (error) {
    setToast(error.message || 'Git 状态不可用');
  }
  renderHeader();
  if (state.settingsOpen) renderSettings();
}

function setToast(message) {
  state.gitToast = message || '';
  renderToast();
  clearTimeout(toastTimer);
  if (state.gitToast && !state.gitBusy) {
    toastTimer = setTimeout(() => {
      state.gitToast = '';
      renderToast();
    }, 2400);
  }
}

async function gitAction(name, extra = {}) {
  if (!state.cwd) return;
  state.gitBusy = true;
  renderToast();
  renderSettings();
  try {
    await shell(name, { cwd: state.cwd, ...extra });
    state.gitDialog = '';
    state.gitConfirmAction = '';
    renderSheet();
    renderDialog();
    state.gitBusy = false;
    setToast('完成');
    await refreshGit();
  } catch (error) {
    state.gitBusy = false;
    setToast(error.message || 'Git 失败');
  }
  renderToast();
  renderSettings();
}

function maybeConfirm(name, extra = {}) {
  if (state.gitStatus.isDefaultRef && (name === 'gitPush' || name === 'gitCreateChangeRequest')) {
    state.gitConfirmAction = name;
    state.gitDialog = 'confirm';
    renderSheet();
    renderDialog();
  } else {
    gitAction(name, extra);
  }
}

function runGitPrimary() {
  const quick = currentQuick();
  if (quick.disabled) {
    setToast(quick.hint);
    return;
  }
  if (quick.kind === 'run_pull') {
    gitAction('gitPull');
    return;
  }
  if (quick.action === 'commit' || quick.action === 'commit_push' || quick.action === 'commit_push_pr') {
    state.gitDialog = 'commit';
    renderDialog();
    return;
  }
  if (quick.action === 'push') {
    maybeConfirm('gitPush');
    return;
  }
  if (quick.action === 'create_pr') {
    maybeConfirm('gitCreateChangeRequest');
    return;
  }
  if (quick.kind === 'open_publish') {
    showBanner('请在电脑上发布仓库');
    setToast('发布仓库不可用');
    return;
  }
  if (quick.kind === 'open_pr') {
    showBanner('已在电脑上打开拉取请求');
    setToast(state.gitStatus.pr?.number != null ? `打开拉取请求 #${state.gitStatus.pr.number}` : '打开拉取请求');
    return;
  }
  setToast(quick.hint);
}

async function loadBranches() {
  if (!state.cwd) return;
  try {
    const result = await shell('gitBranchList', { cwd: state.cwd });
    state.branches = parseBranchList(result);
    state.branchQuery = '';
    state.gitDialog = 'branch';
    renderSheet();
  } catch (error) {
    setToast(error.message || '无法列出分支');
  }
}

function switchBranch(ref) {
  gitAction('gitSwitchBranch', { ref });
}

function createBranch() {
  const name = state.newBranchName.trim();
  if (!name) return;
  gitAction('gitCreateBranch', { name });
  state.newBranchName = '';
}

async function loadFiles() {
  if (!state.cwd) return;
  try {
    const result = await shell('listDir', { cwd: state.cwd, relativePath: '' });
    const entries = Array.isArray(result?.entries) ? result.entries : [];
    state.fileEntries = entries
      .map((entry) => {
        const name = typeof entry?.name === 'string' ? entry.name : '';
        if (!name) return '';
        return entry?.kind === 'directory' ? `${name}/` : name;
      })
      .filter(Boolean);
  } catch (error) {
    showBanner(error.message || '无法列出文件');
  }
  if (state.settingsOpen) renderSettings();
}

function insertMention(path) {
  draft.value = draft.value ? `${draft.value.trimEnd()} @${path} ` : `@${path} `;
  closeSettings();
  renderComposer();
  draft.focus();
}

async function requestHost(name, payload = {}) {
  try {
    await shell(name, payload);
    showBanner(name === 'openGallery'
      ? '已请求电脑打开外观。请在电脑上点浏览图库。'
      : name === 'openSettings' ? '已请求在电脑打开设置' : '已发送到电脑');
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) {
      showBanner(error.message || '电脑没有响应');
    }
  }
}

async function logoutDevice() {
  if (state.transport === 'chisacode') {
    forceLogout('');
    return;
  }
  try {
    await fetch(`${origin}/__remote__/logout`, { credentials: 'include', redirect: 'manual' });
  } catch { /* 网络失败也照样清态回连接页 */ }
  forceLogout('');
}

// —— 设置 overlay（M4 Hub 钻取 + M5 工作区/文件 pane）—— //

function openSettings(pane = '') {
  state.settingsOpen = true;
  state.settingsPane = pane;
  phone.removeAttribute('data-drawer');
  backdrop.classList.add('hidden');
  renderSettings();
  renderScreen();
}

function closeSettings() {
  state.settingsOpen = false;
  state.settingsPane = '';
  renderScreen();
}

function noticeNode(text) {
  const notice = document.createElement('p');
  notice.className = 'notice';
  notice.textContent = text;
  return notice;
}

function paneTitleNode(text) {
  const node = document.createElement('h3');
  node.className = 'pane-title';
  node.textContent = text;
  return node;
}

function descNode(text, cls = 'row-desc') {
  const node = document.createElement('p');
  node.className = cls;
  node.textContent = text;
  return node;
}

function ghostButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost-btn';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function primaryButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'primary-btn';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function fieldInput(value, placeholder, onInput) {
  const input = document.createElement('input');
  input.className = 'paste';
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function hairRow(title, desc, trailing) {
  const row = document.createElement('div');
  row.className = 'hair';
  const grow = document.createElement('div');
  grow.className = 'grow';
  const titleNode = document.createElement('div');
  titleNode.textContent = title;
  grow.append(titleNode);
  if (desc) grow.append(descNode(desc));
  row.append(grow);
  if (trailing) row.append(trailing);
  return row;
}

function switchNode(on, onToggle) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'switch';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-pressed', String(on));
  button.addEventListener('click', onToggle);
  return button;
}

function renderSettingsHub() {
  options.append(noticeNode('远程页上的改动只留在这次连接，不会写回电脑上的 settings.yaml。标了「电脑」的项会改 Host 窗口。'));
  const groups = settingsGroups({
    channel: channelLabel(origin),
    accessMode: state.accessMode,
    gitLine: gitStatusLine(state.gitStatus),
    scheme: store.scheme,
  });
  for (const group of groups) {
    const wrap = document.createElement('div');
    const label = document.createElement('p');
    label.className = 'group-label';
    label.textContent = group.label;
    const body = document.createElement('div');
    body.className = 'group';
    for (const row of group.rows) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `link-row${row.danger ? ' danger' : ''}`;
      const main = document.createElement('span');
      main.className = 'link-main';
      const title = document.createElement('span');
      title.className = 'link-title';
      title.textContent = row.pane;
      const desc = document.createElement('span');
      desc.className = 'link-desc';
      desc.textContent = row.desc;
      main.append(title, desc);
      button.append(main);
      if (!row.danger) {
        const chev = document.createElement('span');
        chev.className = 'chev';
        chev.textContent = '›';
        button.append(chev);
      }
      button.addEventListener('click', () => {
        if (row.action === 'logout') {
          logoutDevice();
          return;
        }
        state.settingsPane = row.pane;
        if (row.pane === '工作区') refreshGit();
        if (row.pane === '文件' || row.pane === '工作区') loadFiles();
        renderSettings();
      });
      body.append(button);
    }
    wrap.append(label, body);
    options.append(wrap);
  }
}

function renderPhoneAppearance() {
  options.append(descNode('只改这台手机。电脑窗口的色制和背景图在「电脑外观」。'));
  options.append(paneTitleNode('色制'));
  options.append(descNode('这台手机用浅色、深色，还是跟随系统。'));
  const tiles = document.createElement('div');
  tiles.className = 'tiles';
  for (const [id, label] of [['light', '浅色'], ['dark', '深色'], ['system', '跟随系统']]) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile';
    tile.textContent = label;
    tile.setAttribute('aria-pressed', String(store.scheme === id));
    tile.addEventListener('click', () => {
      store.scheme = id;
      persistPhoneStore('scheme', id);
      applyAppearance();
      renderSettings();
    });
    tiles.append(tile);
  }
  options.append(tiles);
  options.append(paneTitleNode('玻璃透明度'));
  options.append(descNode('这台手机的毛玻璃。数值越低越通透。不改电脑窗口。'));
  const slider = document.createElement('input');
  slider.className = 'slider';
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = String(store.glass);
  slider.style.setProperty('--fill', `${store.glass}%`);
  slider.addEventListener('input', () => {
    store.glass = Number(slider.value);
    slider.style.setProperty('--fill', `${store.glass}%`);
    persistPhoneStore('glass', store.glass);
    applyAppearance();
  });
  options.append(slider);
  options.append(paneTitleNode('字体'));
  options.append(hairRow('界面字体', '留空则用系统默认。只作用于这台手机。'));
  options.append(fieldInput(store.uiFont, '系统默认', (value) => {
    store.uiFont = value;
    persistPhoneStore('uiFont', value);
    applyAppearance();
  }));
}

function gitCapsuleNode() {
  const quick = currentQuick();
  const capsule = document.createElement('div');
  capsule.className = 'git-capsule';
  const branch = document.createElement('button');
  branch.type = 'button';
  branch.className = 'cap-branch';
  branch.disabled = state.gitBusy;
  const branchLabel = document.createElement('span');
  branchLabel.textContent = state.gitStatus.refName ?? '—';
  branch.append(branchLabel, document.createTextNode(' ▾'));
  branch.addEventListener('click', () => loadBranches());
  const primary = document.createElement('button');
  primary.type = 'button';
  primary.className = 'cap-primary';
  primary.disabled = quick.disabled || state.gitBusy;
  const primaryLabel = document.createElement('span');
  primaryLabel.textContent = quick.label;
  primary.append(primaryLabel);
  primary.addEventListener('click', () => runGitPrimary());
  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'cap-menu';
  menu.disabled = state.gitBusy;
  menu.setAttribute('aria-label', 'Git 操作');
  menu.textContent = '▾';
  menu.addEventListener('click', () => {
    state.gitDialog = 'menu';
    renderSheet();
  });
  const dividerA = document.createElement('span');
  dividerA.className = 'divider';
  const dividerB = document.createElement('span');
  dividerB.className = 'divider';
  capsule.append(branch, dividerA, primary, dividerB, menu);
  return capsule;
}

function renderFilesInto(target) {
  const list = document.createElement('div');
  const renderRows = () => {
    const query = state.fileQuery.trim();
    const rows = state.fileEntries.filter((path) => !query || path.includes(query));
    if (!rows.length) {
      list.replaceChildren(descNode('没有匹配的文件'));
      return;
    }
    list.replaceChildren(...rows.map((path) => {
      const clean = path.replace(/\/$/, '');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'file-row';
      const main = document.createElement('span');
      main.className = 'file-main';
      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = clean.split('/').pop() || path;
      const full = document.createElement('span');
      full.className = 'file-path';
      full.textContent = path;
      main.append(name, full);
      button.append(main);
      button.addEventListener('click', () => insertMention(clean));
      return button;
    }));
  };
  target.append(fieldInput(state.fileQuery, '搜索文件', (value) => {
    state.fileQuery = value;
    renderRows();
  }), list);
  renderRows();
}

function renderWorkspacePane() {
  options.append(gitCapsuleNode());
  options.append(descNode(gitStatusLine(state.gitStatus)));
  const tabs = document.createElement('div');
  tabs.className = 'ws-tabs';
  for (const [id, label] of [['changes', '更改'], ['files', '文件']]) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'ws-tab';
    tab.setAttribute('aria-selected', String(state.wsTab === id));
    tab.textContent = label;
    tab.addEventListener('click', () => {
      state.wsTab = id;
      if (id === 'files') loadFiles();
      renderSettings();
    });
    tabs.append(tab);
  }
  options.append(tabs);
  if (state.wsTab === 'files') {
    renderFilesInto(options);
  } else {
    options.append(descNode(state.gitStatus.hasWorkingTreeChanges
      ? '有未提交更改。用顶部胶囊提交，或到文件 Tab 插入路径。'
      : '工作区是干净的。'));
  }
}

function renderHostRequestPane(pane) {
  options.append(descNode('这些项在电脑 Host 上。手机只发送打开请求，不画假清单。'));
  const section = hostSettingsSection(pane);
  if (section) {
    options.append(primaryButton(`在电脑上打开${pane}`, () => requestHost('openSettings', { sectionId: section })));
    return;
  }
  options.append(descNode('会话内选项只留在这次连接。电脑窗口关闭行为请在电脑设置里改。', 'lead'));
  options.append(ghostButton('在电脑上打开设置', () => requestHost('openSettings')));
}

function renderSettings() {
  if (!state.settingsOpen) return;
  const pane = state.settingsPane;
  settingsTitle.textContent = pane || '设置';
  settingsBack.classList.toggle('hidden', !pane);
  options.replaceChildren();
  if (!pane) {
    renderSettingsHub();
    return;
  }
  if (pane === '外观') {
    renderPhoneAppearance();
    return;
  }
  if (pane === '工作区') {
    renderWorkspacePane();
    return;
  }
  if (pane === '文件') {
    renderFilesInto(options);
    return;
  }
  if (pane === '电脑外观') {
    options.append(noticeNode('图库窗口在电脑上。这里可以请电脑打开外观。'));
    options.append(paneTitleNode('背景图'));
    options.append(ghostButton('在电脑上打开图库', () => requestHost('openGallery')));
    options.append(ghostButton('在电脑上打开外观', () => requestHost('openSettings', { sectionId: 'appearance' })));
    return;
  }
  if (pane === '界面设置') {
    options.append(hairRow(
      '标题栏 Git 操作',
      '电脑宽屏标题栏和手机对话页头显示分支胶囊。工作区顶部的 Git 操作始终可用。',
      switchNode(store.gitTitle, () => {
        store.gitTitle = !store.gitTitle;
        persistPhoneStore('gitTitle', store.gitTitle);
        renderHeader();
        renderSettings();
      }),
    ));
    options.append(ghostButton('在电脑上打开界面设置', () => requestHost('openSettings')));
    return;
  }
  if (pane === '连接详情') {
    options.append(noticeNode('远程页上的改动只留在这次连接，不会写回电脑上的 settings.yaml。'));
    options.append(hairRow('主机', state.hostName));
    options.append(hairRow('通道', channelLabel(origin)));
    const danger = document.createElement('button');
    danger.type = 'button';
    danger.className = 'danger-btn';
    danger.textContent = '断开这台设备';
    danger.addEventListener('click', () => logoutDevice());
    options.append(danger);
    return;
  }
  if (pane === '权限') {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'selector-chip';
    chip.textContent = state.accessMode;
    chip.addEventListener('click', () => {
      state.accessMode = state.accessMode === '只读' ? '完全访问' : '只读';
      renderComposer();
      renderSettings();
    });
    options.append(hairRow('默认访问模式', '新会话的工具权限。完全访问仍要确认。', chip));
    return;
  }
  renderHostRequestPane(pane);
}

// —— sheet / dialog / toast / lightbox —— //

function sheetItem({ label, hint = '', enabled = true, onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sheet-item';
  button.disabled = !enabled;
  const main = document.createElement('span');
  main.className = 'sheet-item-main';
  const title = document.createElement('span');
  title.textContent = label;
  main.append(title);
  if (hint) {
    const hintNode = document.createElement('span');
    hintNode.className = 'sheet-hint';
    hintNode.textContent = hint;
    main.append(hintNode);
  }
  button.append(main);
  if (enabled) button.addEventListener('click', onClick);
  return button;
}

function sheetLayer(title, closeSheet) {
  const layer = document.createElement('div');
  layer.className = 'sheet-layer';
  const mask = document.createElement('button');
  mask.type = 'button';
  mask.className = 'sheet-mask';
  mask.setAttribute('aria-label', '关闭');
  mask.addEventListener('click', closeSheet);
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  const heading = document.createElement('p');
  heading.className = 'sheet-title';
  heading.textContent = title;
  sheet.append(heading);
  layer.append(mask, sheet);
  return { layer, sheet };
}

function closeGitLayer() {
  state.gitDialog = '';
  state.gitConfirmAction = '';
  renderSheet();
  renderDialog();
}

function renderSheet() {
  sheetRoot.replaceChildren();
  if (state.attachOpen) {
    const { layer, sheet } = sheetLayer('添加', () => {
      state.attachOpen = false;
      renderSheet();
    });
    sheet.append(
      sheetItem({ label: '拍照', onClick: () => { state.attachOpen = false; renderSheet(); fileCamera.click(); } }),
      sheetItem({ label: '从相册选择', onClick: () => { state.attachOpen = false; renderSheet(); fileGallery.click(); } }),
      sheetItem({ label: '从工作区选文件', onClick: () => { state.attachOpen = false; renderSheet(); openSettings('文件'); loadFiles(); } }),
    );
    sheetRoot.append(layer);
    return;
  }
  if (state.gitDialog === 'menu') {
    const { layer, sheet } = sheetLayer('Git 操作', closeGitLayer);
    const quick = currentQuick();
    const hasOpenPr = state.gitStatus.pr?.state === 'open';
    const status = state.gitStatus;
    sheet.append(
      sheetItem({ label: 'Fetch', enabled: !state.gitBusy, onClick: () => gitAction('gitFetchForStatus') }),
      sheetItem({ label: 'Pull', enabled: !state.gitBusy, onClick: () => gitAction('gitPull') }),
      sheetItem({
        label: 'Commit',
        enabled: !state.gitBusy && status.hasWorkingTreeChanges,
        hint: status.hasWorkingTreeChanges ? '' : '工作区是干净的。请先改文件再提交。',
        onClick: () => { state.gitDialog = 'commit'; renderSheet(); renderDialog(); },
      }),
      sheetItem({
        label: 'Push',
        enabled: !state.gitBusy && status.aheadCount > 0 && !status.hasWorkingTreeChanges && status.behindCount === 0,
        hint: status.hasWorkingTreeChanges ? '请先提交或贮藏本地改动再推送。' : '',
        onClick: () => { state.gitDialog = ''; renderSheet(); maybeConfirm('gitPush'); },
      }),
      sheetItem({
        label: hasOpenPr ? 'View PR' : 'Create PR',
        enabled: !state.gitBusy && (hasOpenPr || (status.aheadCount > 0 && !status.hasWorkingTreeChanges)),
        onClick: () => {
          if (hasOpenPr) {
            closeGitLayer();
            showBanner('已在电脑上打开拉取请求');
            setToast('打开拉取请求');
          } else {
            state.gitDialog = '';
            renderSheet();
            maybeConfirm('gitCreateChangeRequest');
          }
        },
      }),
    );
    if (quick.kind === 'show_hint' && quick.hint) {
      const note = document.createElement('p');
      note.className = 'sheet-note';
      note.textContent = quick.hint;
      sheet.append(note);
    }
    sheetRoot.append(layer);
    return;
  }
  if (state.gitDialog === 'branch') {
    const { layer, sheet } = sheetLayer('切换分支', closeGitLayer);
    const list = document.createElement('div');
    const renderRows = () => {
      const query = state.branchQuery.trim();
      const rows = state.branches.filter((branch) => !query || branch.name.toLowerCase().includes(query.toLowerCase()));
      const nodes = [];
      if (!rows.length) {
        const note = document.createElement('p');
        note.className = 'sheet-note';
        note.textContent = '没有匹配的分支';
        nodes.push(note);
      }
      for (const branch of rows) {
        const current = branch.isCurrent && !branch.isRemote;
        nodes.push(sheetItem({
          label: branch.name,
          enabled: !current,
          hint: branch.isRemote ? '远程' : current ? '当前' : '',
          onClick: () => switchBranch(branch.isRemote ? branch.name.replace(/^origin\//, '') : branch.name),
        }));
      }
      const canCreate = Boolean(query) && !state.branches.some((branch) => branch.name === query && !branch.isRemote);
      nodes.push(sheetItem({
        label: canCreate ? `创建并检出分支「${query}」` : '创建并检出新分支…',
        onClick: () => {
          if (canCreate) state.newBranchName = query;
          state.gitDialog = 'create-branch';
          renderSheet();
          renderDialog();
        },
      }));
      list.replaceChildren(...nodes);
    };
    sheet.append(fieldInput(state.branchQuery, '搜索分支…', (value) => {
      state.branchQuery = value;
      renderRows();
    }), list);
    renderRows();
    sheetRoot.append(layer);
    return;
  }
  renderDialog();
}

function dialogLayer(compact) {
  const layer = document.createElement('div');
  layer.className = 'dialog-layer';
  if (compact) layer.dataset.compact = '';
  const mask = document.createElement('button');
  mask.type = 'button';
  mask.className = 'dialog-mask';
  mask.setAttribute('aria-label', '关闭');
  mask.addEventListener('click', closeGitLayer);
  const dialog = document.createElement('div');
  dialog.className = 'dialog';
  layer.append(mask, dialog);
  return { layer, dialog };
}

function dialogHead(dialog, title, lead) {
  const heading = document.createElement('h3');
  heading.textContent = title;
  dialog.append(heading, descNode(lead, 'lead'));
}

function dialogFoot(dialog, buttons) {
  const foot = document.createElement('div');
  foot.className = 'dialog-foot';
  foot.append(...buttons);
  dialog.append(foot);
}

function renderDialog() {
  dialogRoot.replaceChildren();
  const kind = state.gitDialog;
  if (kind !== 'commit' && kind !== 'create-branch' && kind !== 'confirm') return;
  if (kind === 'commit') {
    const { layer, dialog } = dialogLayer(false);
    dialogHead(dialog, '提交更改', '确认本次提交内容。提交信息留空将自动生成。');
    const body = document.createElement('div');
    body.className = 'dialog-body';
    const card = document.createElement('div');
    card.className = 'commit-card';
    const refRow = document.createElement('div');
    refRow.className = 'ref-row';
    const refLabel = document.createElement('span');
    refLabel.className = 'row-desc';
    refLabel.textContent = '分支';
    const refName = document.createElement('b');
    refName.textContent = state.gitStatus.refName ?? '—';
    refRow.append(refLabel, refName);
    if (state.gitStatus.isDefaultRef) {
      const warn = document.createElement('span');
      warn.className = 'warn';
      warn.textContent = '警告：目标为默认分支';
      refRow.append(warn);
    }
    card.append(refRow, descNode(state.gitStatus.hasWorkingTreeChanges ? '有未提交更改' : '无'));
    body.append(card);
    body.append(descNode('提交信息（可选）', 'field-label'));
    body.append(fieldInput(state.commitMessage, '留空则自动生成', (value) => {
      state.commitMessage = value;
    }));
    dialog.append(body);
    dialogFoot(dialog, [
      ghostButton('取消', closeGitLayer),
      ghostButton('在新建分支上提交', () => {
        state.gitDialog = 'create-branch';
        renderDialog();
      }),
      primaryButton('提交', () => gitAction('gitCommit', { message: state.commitMessage })),
    ]);
    dialogRoot.append(layer);
    return;
  }
  if (kind === 'create-branch') {
    const { layer, dialog } = dialogLayer(true);
    dialogHead(dialog, '创建并检出新分支', '基于当前 HEAD 创建一个新的本地分支，并在创建成功后立即切换过去。');
    const body = document.createElement('div');
    body.className = 'dialog-body';
    body.append(descNode('分支名', 'field-label'));
    const input = fieldInput(state.newBranchName, '例如 feature/git-branch-switcher', (value) => {
      state.newBranchName = value;
      createBtn.disabled = !value.trim();
    });
    body.append(input);
    dialog.append(body);
    const createBtn = primaryButton('Create branch', () => createBranch());
    createBtn.disabled = !state.newBranchName.trim();
    dialogFoot(dialog, [ghostButton('取消', closeGitLayer), createBtn]);
    dialogRoot.append(layer);
    return;
  }
  const { layer, dialog } = dialogLayer(true);
  const isPr = state.gitConfirmAction === 'gitCreateChangeRequest';
  dialogHead(
    dialog,
    isPr ? '从默认分支推送并创建 pull request？' : '推送到默认分支？',
    `此操作会作用在“${state.gitStatus.refName ?? ''}”。你可以继续在此引用上操作，或新建功能引用后再执行同一操作。`,
  );
  dialogFoot(dialog, [
    ghostButton('取消', closeGitLayer),
    ghostButton('新建功能分支', () => {
      state.gitDialog = 'create-branch';
      renderDialog();
    }),
    primaryButton(isPr ? '推送并创建 pull request' : `推送到 ${state.gitStatus.refName ?? ''}`, () => {
      const name = state.gitConfirmAction;
      state.gitConfirmAction = '';
      state.gitDialog = '';
      renderDialog();
      if (name) gitAction(name);
    }),
  ]);
  dialogRoot.append(layer);
}

function renderToast() {
  toastRoot.replaceChildren();
  if (!state.gitBusy && !state.gitToast) return;
  const layer = document.createElement('div');
  layer.className = 'toast-layer';
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (state.gitBusy) {
    const spin = document.createElement('span');
    spin.className = 'spin';
    toast.append(spin);
  } else {
    const bad = state.gitToast.includes('失败') || state.gitToast.includes('不可用');
    const mark = document.createElement('span');
    mark.className = `mark ${bad ? 'bad' : 'ok'}`;
    mark.textContent = bad ? '!' : '✓';
    toast.append(mark);
  }
  const main = document.createElement('span');
  main.className = 'toast-main';
  const title = document.createElement('b');
  title.textContent = state.gitBusy ? 'Git 操作进行中' : (state.gitToast || '完成');
  main.append(title);
  if (state.gitStatus.refName != null && !state.gitBusy) {
    const ref = document.createElement('span');
    ref.textContent = state.gitStatus.refName;
    main.append(ref);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-btn';
  close.setAttribute('aria-label', '关闭');
  close.textContent = '×';
  close.addEventListener('click', () => {
    state.gitToast = '';
    renderToast();
  });
  toast.append(main, close);
  layer.append(toast);
  toastRoot.append(layer);
}

function renderLightbox() {
  lightboxRoot.replaceChildren();
  if (!state.lightbox) return;
  const layer = document.createElement('div');
  layer.className = 'lightbox-layer';
  const mask = document.createElement('button');
  mask.type = 'button';
  mask.className = 'lightbox-mask';
  mask.setAttribute('aria-label', '关闭');
  const img = document.createElement('img');
  img.src = `data:${state.lightbox.mediaType};base64,${state.lightbox.data}`;
  img.alt = '图片预览';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lightbox-close';
  close.setAttribute('aria-label', '关闭');
  close.textContent = '×';
  const dismiss = () => {
    state.lightbox = null;
    renderLightbox();
  };
  mask.addEventListener('click', dismiss);
  close.addEventListener('click', dismiss);
  layer.append(mask, img, close);
  lightboxRoot.append(layer);
}

// —— 事件接线 —— //

scanOpen.addEventListener('click', () => {
  startScan();
});
el('scan-cancel').addEventListener('click', () => closeScan());
scanTorch.addEventListener('click', () => toggleTorch());
el('permission-paste').addEventListener('click', () => {
  state.route = 'connect';
  renderScreen();
  pasteInput.focus();
});
el('paste-enter').addEventListener('click', () => {
  const outcome = classifyScan(pasteInput.value, origin);
  if (outcome.kind === 'invalid') {
    showError('链接无效');
    return;
  }
  if (outcome.kind === 'navigate') {
    window.location.replace(outcome.url);
    return;
  }
  connect(outcome.offerUrl).catch((error) => showError(error.message || '连接失败'));
});
el('menu').addEventListener('click', () => {
  phone.setAttribute('data-drawer', '');
  backdrop.classList.remove('hidden');
});
backdrop.addEventListener('click', () => {
  phone.removeAttribute('data-drawer');
  backdrop.classList.add('hidden');
});
el('new-session').addEventListener('click', () => {
  createSession().catch((error) => showBanner(error.message));
});
el('open-workspace').addEventListener('click', () => {
  openSettings('工作区');
  refreshGit();
  loadFiles();
});
el('open-settings').addEventListener('click', () => openSettings(''));
settingsBack.addEventListener('click', () => {
  state.settingsPane = '';
  renderSettings();
});
el('close-settings').addEventListener('click', () => closeSettings());
search.addEventListener('input', () => {
  state.query = search.value;
  renderSessions();
});
draft.addEventListener('input', () => renderComposer());
composer.addEventListener('submit', (event) => {
  event.preventDefault();
  sendPrompt().catch((error) => showBanner(error.message || '发送失败'));
});
stopBtn.addEventListener('click', () => cancelRun());
el('attach-toggle').addEventListener('click', () => {
  state.attachOpen = !state.attachOpen;
  state.gitDialog = '';
  renderSheet();
});
accessChip.addEventListener('click', () => openSettings('权限'));
el('model-chip').addEventListener('click', () => openSettings('模型'));
fileCamera.addEventListener('change', () => {
  addFiles(fileCamera.files);
  fileCamera.value = '';
});
fileGallery.addEventListener('change', () => {
  addFiles(fileGallery.files);
  fileGallery.value = '';
});
gitPill.addEventListener('click', () => {
  openSettings('工作区');
  refreshGit();
});
el('approval-allow').addEventListener('click', () => {
  answerApproval('allowed-once').catch((error) => showBanner(error.message));
});
el('approval-reject').addEventListener('click', () => {
  answerApproval('rejected').catch((error) => showBanner(error.message));
});

// —— 启动 —— //

applyAppearance();
renderComposer();
renderScreen();
initScanButton();

if (hasOfferFragment(window.location.hash)) {
  connect(window.location.href).catch((error) => showError(error.message || '配对链接无效'));
} else if (listStickyServerIds().length) {
  connectSticky().catch((error) => showError(error.message || '重连失败'));
}
