const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const whaleSvg = fs.readFileSync(path.join(root, 'assets', 'whale.svg'), 'utf8');

// NSIS/MUI2 bitmap geometry is fixed: the welcome/finish sidebar is 164x314
// and the page header strip is 150x57 (classic 96dpi dialog units).
const SIDEBAR_WIDTH = 164;
const SIDEBAR_HEIGHT = 314;
const HEADER_WIDTH = 150;
const HEADER_HEIGHT = 57;
// Render at 2x then downscale for crisp antialiasing in the final bitmap.
const SCALE = 2;

// Build-time bitmaps cannot consume runtime CSS tokens; these literals mirror
// the product palette: INK/PAPER are the app icon tile (assets/icon.svg) and
// BLUE is the brand --dsw-static-deepseek-500 (design-language.md).
const INK = '#0b0d12';
const PAPER = '#e8eef9';
const BLUE = 'rgb(65, 118, 230)';
const MUTED = '#8a93a6';
const DISABLED = '#5a6170';

const FONT_STACK = "-apple-system, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans', 'DejaVu Sans', Arial, sans-serif";

function whaleMark(size, color) {
  // whale.svg fills with currentColor; wrap it so the color applies.
  return `<div style="width:${size}px;height:${size}px;color:${color}">${whaleSvg
    .replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>`;
}

/**
 * Welcome/finish sidebar: near-black brand canvas (same ink as the app icon
 * tile), whale mark, Latin wordmark and a DeepSeek-blue accent bar. Chinese
 * copy stays in the localized MUI strings, not baked into bitmaps.
 */
function sidebarHtml(k, { markColor, titleColor, subColor, accentColor }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:${SIDEBAR_WIDTH * k}px;height:${SIDEBAR_HEIGHT * k}px;overflow:hidden}
    body{background:${INK};font-family:${FONT_STACK};position:relative}
    .stack{position:absolute;top:${64 * k}px;left:0;right:${1 * k}px;display:flex;flex-direction:column;align-items:center}
    .word{margin-top:${22 * k}px;font-size:${17 * k}px;line-height:${24 * k}px;font-weight:600;color:${titleColor};letter-spacing:${0.4 * k}px}
    .sub{margin-top:${2 * k}px;font-size:${9.5 * k}px;line-height:${16 * k}px;font-weight:500;color:${subColor};letter-spacing:${1.6 * k}px;text-transform:uppercase}
    .rule{margin-top:${18 * k}px;width:${24 * k}px;height:${3 * k}px;background:${accentColor}}
    .hairline{position:absolute;top:0;right:0;width:${1 * k}px;height:100%;background:rgba(255,255,255,0.08)}
  </style></head><body>
    <div class="stack">
      ${whaleMark(88 * k, markColor)}
      <div class="word">DeepSeek</div>
      <div class="sub">Harness Desktop</div>
      <div class="rule"></div>
    </div>
    <div class="hairline"></div>
  </body></html>`;
}

/**
 * Page header strip (shown at the right of the white MUI header): whale mark
 * on white so it blends with the NSIS-drawn title area.
 */
function headerHtml(k) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:${HEADER_WIDTH * k}px;height:${HEADER_HEIGHT * k}px;overflow:hidden}
    body{background:#ffffff;position:relative}
    .mark{position:absolute;top:${((HEADER_HEIGHT - 30) / 2) * k}px;right:${16 * k}px}
  </style></head><body>
    <div class="mark">${whaleMark(30 * k, INK)}</div>
  </body></html>`;
}

/** Encode an opaque nativeImage as a classic 24-bit BITMAPINFOHEADER BMP. */
function bmp24FromImage(image) {
  const { width, height } = image.getSize();
  const bgra = image.toBitmap();
  if (bgra.length !== width * height * 4) {
    throw new Error(`unexpected bitmap buffer ${bgra.length} for ${width}x${height}`);
  }
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const out = Buffer.alloc(14 + 40 + pixelBytes);
  out.write('BM', 0, 'ascii');
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(0, 30);
  out.writeUInt32LE(pixelBytes, 34);
  out.writeInt32LE(2835, 38);
  out.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y += 1) {
    const srcRow = (height - 1 - y) * width * 4;
    let dst = 54 + y * rowSize;
    for (let x = 0; x < width; x += 1) {
      const src = srcRow + x * 4;
      out[dst] = bgra[src];
      out[dst + 1] = bgra[src + 1];
      out[dst + 2] = bgra[src + 2];
      dst += 3;
    }
  }
  return out;
}

// One shared window for every render: some environments fail any page load
// after an offscreen BrowserWindow has been destroyed. The window is sized to
// the largest target once; each render captures its own page rect so no
// mid-run resize has to settle.
async function renderBmp(win, html, width, height, dest) {
  // Long data: URLs flake with ERR_FAILED; load from a temp file instead.
  const htmlFile = path.join(require('os').tmpdir(), `installer-asset-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(htmlFile, html);
  try {
    await win.loadFile(htmlFile);
  } finally {
    fs.rmSync(htmlFile, { force: true });
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  const capture = await win.webContents.capturePage({
    x: 0,
    y: 0,
    width: width * SCALE,
    height: height * SCALE,
  });
  const image = nativeImage
    .createFromBuffer(capture.toPNG())
    .resize({ width, height, quality: 'best' });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bmp24FromImage(image));
  process.stdout.write(`wrote ${dest}\n`);
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');

app.whenReady().then(async () => {
  const buildDir = path.join(root, 'build');
  const win = new BrowserWindow({
    width: Math.max(SIDEBAR_WIDTH, HEADER_WIDTH) * SCALE,
    height: Math.max(SIDEBAR_HEIGHT, HEADER_HEIGHT) * SCALE,
    useContentSize: true,
    show: false,
    frame: false,
    webPreferences: { offscreen: true },
  });
  await renderBmp(
    win,
    sidebarHtml(SCALE, { markColor: PAPER, titleColor: PAPER, subColor: MUTED, accentColor: BLUE }),
    SIDEBAR_WIDTH,
    SIDEBAR_HEIGHT,
    path.join(buildDir, 'installerSidebar.bmp'),
  );
  // Uninstaller variant: muted mark, no brand accent (removal context).
  await renderBmp(
    win,
    sidebarHtml(SCALE, { markColor: DISABLED, titleColor: MUTED, subColor: DISABLED, accentColor: DISABLED }),
    SIDEBAR_WIDTH,
    SIDEBAR_HEIGHT,
    path.join(buildDir, 'uninstallerSidebar.bmp'),
  );
  await renderBmp(win, headerHtml(SCALE), HEADER_WIDTH, HEADER_HEIGHT, path.join(buildDir, 'installerHeader.bmp'));
  win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
