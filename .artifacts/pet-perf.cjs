const { app, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const { createLive2dPetManager } = require(path.join(root, 'src/main/desktop-live2d'));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-pet-perf-')));
const report = { started: new Date().toISOString(), logs: [], phases: [] };
const reportFile = path.join(__dirname, process.argv.includes('--confirmation') ? 'pet-perf-confirmation.json' : 'pet-perf.json');
let manager;
let phase = 'startup';
const samples = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const save = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
app.on('window-all-closed', () => {});
app.on('web-contents-created', (_, wc) => {
  wc.on('console-message', (_, details, legacyMessage) => {
    const message = legacyMessage || details.message || String(details);
    if (report.logs.length < 100) report.logs.push({ phase, message });
  });
  wc.on('render-process-gone', (_, details) => report.logs.push({ phase, gone: details }));
});
const hardStop = setTimeout(() => {
  report.error = 'Probe timeout';
  save();
  app.exit(1);
}, 180000);

app.whenReady().then(async () => {
  const timer = setInterval(() => {
    samples.push({ phase, time: Date.now(), processes: app.getAppMetrics() });
  }, 1000);
  try {
    report.gpu = await app.getGPUInfo('complete');
    report.gpuStatus = app.getGPUFeatureStatus();
    report.displays = screen.getAllDisplays().map(d => ({
      bounds: d.bounds, scaleFactor: d.scaleFactor, frequency: d.displayFrequency,
    }));
    let config = { live2dPet: { enabled: true }, whaleAssistantEnabled: false };
    manager = createLive2dPetManager({
      loadConfig: () => config,
      saveConfig: patch => { config = { ...config, ...patch }; },
      rendererFile: name => path.join(root, 'src/renderer', name),
      preloadFile: () => path.join(root, 'src/preload/index.js'),
      sessionsDir: '',
    });
    const win = manager.show();
    const wc = win.webContents;
    report.mainPid = process.pid;
    report.rendererPid = wc.getOSProcessId();
    save();
    const deadline = Date.now() + 90000;
    let ready = false;
    while (Date.now() < deadline) {
      await delay(500);
      try {
        ready = await wc.executeJavaScript('typeof session !== "undefined" && !!session && !!imageTensor && painted');
      } catch {}
      if (ready) break;
    }
    if (!ready) throw new Error('Avatar did not produce a frame within 90 seconds');
    await delay(2500);
    report.rendererPid = wc.getOSProcessId();
    report.renderer = await wc.executeJavaScript(`({
      gpu: sessionOnGpu, ortVersion: ort.env.versions,
      canvas: [canvas.width, canvas.height], devicePixelRatio,
      width: innerWidth, height: innerHeight, settings
    })`);
    report.webgpuAdapter = await wc.executeJavaScript(`(async () => {
      const adapter = await navigator.gpu.requestAdapter();
      const info = adapter?.info || {};
      return { vendor:info.vendor, architecture:info.architecture,
        device:info.device, description:info.description,
        isFallbackAdapter:info.isFallbackAdapter ?? adapter?.isFallbackAdapter };
    })()`);
    report.gpuStatus = app.getGPUFeatureStatus();
    await wc.executeJavaScript(`(() => {
      window.__perf = { paused: false, frames: [], runs: [], readbacks: [], paints: [], raf: [], longTasks: [] };
      const originalFrame = renderFrame;
      renderFrame = async function() {
        if (__perf.paused || inferBusy) return;
        const start = performance.now();
        await originalFrame();
        __perf.frames.push(performance.now() - start);
      };
      const originalRun = session.run.bind(session);
      session.run = async function(...args) {
        const start = performance.now();
        const result = await originalRun(...args);
        __perf.runs.push(performance.now() - start);
        return result;
      };
      const originalGetData = ort.Tensor.prototype.getData;
      ort.Tensor.prototype.getData = async function(...args) {
        const start = performance.now();
        const result = await originalGetData.apply(this, args);
        __perf.readbacks.push(performance.now() - start);
        return result;
      };
      const originalPaint = paint;
      paint = function() {
        const start = performance.now();
        const result = originalPaint();
        __perf.paints.push(performance.now() - start);
        return result;
      };
      new PerformanceObserver(list => {
        for (const e of list.getEntries()) __perf.longTasks.push(e.duration);
      }).observe({entryTypes: ['longtask']});
      let last = performance.now();
      requestAnimationFrame(function tick(now) {
        __perf.raf.push(now - last);
        last = now;
        requestAnimationFrame(tick);
      });
    })()`);
    for (const item of [
      { name: 'live-default', paused: false },
      { name: 'same-overlay-inference-paused', paused: true },
      { name: 'live-resumed', paused: false },
    ]) {
      phase = item.name;
      report.currentPhase = phase;
      save();
      await wc.executeJavaScript(`(() => {
        __perf.paused = ${item.paused};
        for (const key of ['frames','runs','readbacks','paints','raf','longTasks']) __perf[key] = [];
      })()`);
      console.log(`PHASE ${phase}`);
      await delay(15000);
      report.phases.push(await wc.executeJavaScript(`(() => {
        const stats = a => {
          const s = [...a].sort((a,b) => a-b);
          return { count:s.length, mean:s.length ? s.reduce((a,b)=>a+b,0)/s.length : 0,
            p50:s[Math.floor(s.length*.5)]||0, p95:s[Math.floor(s.length*.95)]||0,
            max:s.at(-1)||0 };
        };
        return { name:${JSON.stringify(phase)}, durationSeconds:15,
          frames:stats(__perf.frames), runs:stats(__perf.runs),
          readbacks:stats(__perf.readbacks), paints:stats(__perf.paints),
          raf:stats(__perf.raf), longTasks:stats(__perf.longTasks),
          stillAlpha:stillCtl.alpha, inferenceBusy:inferBusy };
      })()`));
      save();
    }
    phase = 'closed';
    manager.setEnabled(false);
    await delay(4000);
    report.samples = samples;
    report.finished = new Date().toISOString();
    save();
    console.log(JSON.stringify({ reportFile, phases: report.phases }));
  } catch (error) {
    report.error = error.stack;
    report.samples = samples;
    save();
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearInterval(timer);
    clearTimeout(hardStop);
    manager?.dispose();
    app.exit(process.exitCode || 0);
  }
});
