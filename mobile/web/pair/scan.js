// 扫码结果分派与能力探测。镜像 Android ScanScreen → DshViewModel.onScanned 的分派语义：
// 同 origin（或裸 #offer=）直接登录；异 origin 整页跳转（token 留在 hash）；无 offer 视为无效继续扫。
import { offerFromPaste } from '../host/offer.js';

function classifyScan(raw, currentOrigin) {
  const text = String(raw || '').trim();
  if (!text) return { kind: 'invalid' };
  const offer = offerFromPaste(text);
  if (!offer) return { kind: 'invalid' };
  let origin = null;
  try {
    origin = new URL(text).origin;
  } catch {
    origin = null;
  }
  if (!origin || origin === 'null' || origin === currentOrigin) {
    return { kind: 'login', offer };
  }
  return { kind: 'navigate', url: text };
}

// 三重探测：secure context（LAN http 页 mediaDevices 为 undefined）、getUserMedia、BarcodeDetector(qr_code)。
// 任一缺失如实降级为粘贴，不渲染假按钮。
async function detectScanSupport(env) {
  if (env?.isSecureContext !== true) {
    return { supported: false, reason: 'insecure-context' };
  }
  if (typeof env?.mediaDevices?.getUserMedia !== 'function') {
    return { supported: false, reason: 'no-camera' };
  }
  const Detector = env.BarcodeDetector;
  if (typeof Detector !== 'function' || typeof Detector.getSupportedFormats !== 'function') {
    return { supported: false, reason: 'no-detector' };
  }
  try {
    const formats = await Detector.getSupportedFormats();
    if (!Array.isArray(formats) || !formats.includes('qr_code')) {
      return { supported: false, reason: 'no-detector' };
    }
  } catch {
    return { supported: false, reason: 'no-detector' };
  }
  return { supported: true, reason: '' };
}

function scanUnavailableHint(reason) {
  if (reason === 'insecure-context') {
    return '局域网明文页无法调用相机。请用系统相机扫码，或把配对链接粘贴到下面。';
  }
  if (reason === 'no-camera' || reason === 'no-detector') {
    return '此浏览器不支持应用内扫码。请用系统相机扫码，或把配对链接粘贴到下面。';
  }
  return '';
}

export { classifyScan, detectScanSupport, scanUnavailableHint };
