# Pet Performance Check

Date: 2026-09-19

## Scope

Two short runs of the actual desktop pet manager and renderer under Electron
43.4.0, using temporary user-data directories and in-memory configuration.
The normal desktop app and other existing applications remained running.
No model API calls, personal session scans or product source edits were made.
The normal user's saved pet setting remains disabled.

## Hardware Snapshot

- AMD Ryzen 7 H 255, 8 cores / 16 logical processors.
- Approximately 32 GB installed memory; 10 GB available at sampling.
- AMD Radeon 780M, driver 32.0.21030.12001.
- Display: 2880 x 1800 at 120 Hz, 200% scaling.
- Overall CPU utilization at the initial snapshot: 10%.

## Measurements

Each measured renderer phase lasted 15 seconds.

| Phase | Avatar frames/s | Mean frame completion | Mean GPU output wait/readback | rAF p95 |
| --- | ---: | ---: | ---: | ---: |
| First run, live | 9.33 | 83.78 ms | 78.08 ms | 8.5 ms |
| First run, resumed | 8.27 | 86.36 ms | 80.47 ms | 8.5 ms |
| Confirmation, live | 9.53 | 82.96 ms | 78.64 ms | 8.4 ms |
| Confirmation, resumed | 8.80 | 91.87 ms | 86.35 ms | 8.5 ms |

In the confirmation run, Windows GPU engine counters for the probe processes
showed mean 3D utilization of 61.75% (4 samples, range 47-71%) while live,
versus 3.89% (9 samples, range 0-13%) with inference paused and the same overlay
still present. Transition samples are included. These are short observations,
not sustained thermal or system-wide frame-time measurements.

The adapter reported AMD / RDNA-3 / isFallbackAdapter=false. ONNX Runtime logged
"session on webgpu"; WebNN was unavailable. Hardware canvas and compositing
were enabled after GPU initialization. No renderer long tasks over 50 ms were
recorded during the measured phases.

## Interpretation

This is not evidence of insufficient CPU or RAM, nor a fallback to CPU-only
inference. The avatar pipeline cannot meet its 50 ms / approximately 20 FPS
target on this machine under the measured conditions.

The renderer waits for GPU output with Tensor.getData(), rearranges 512 x 512
RGBA pixels in JavaScript, writes ImageData to a 2D canvas, then composites it
into the transparent overlay. The getData timing includes queued GPU execution
and synchronization, so these measurements cannot attribute all of it to
transfer bandwidth alone. GPU neural rendering and readback are the primary
measured bottleneck; the draw function itself averaged below 0.3 ms per call.

The integrated GPU contributes a finite compute budget, but this does not
establish a need to replace the computer. Prioritize a lightweight/static pet
mode or reducing neural-rendering/readback cost before hardware changes.
The current power-save option is disabled and only applies after five minutes
of inactivity when enabled; it does not immediately fix low animation FPS.

Whole-desktop compositor frame pacing, thermal throttling, battery versus AC,
and a long-session soak were not measured.

## Evidence

- pet-perf.json: first run with process CPU and memory samples.
- pet-perf-confirmation.json: repeated run, adapter and backend confirmation.
- pet-gpu-samples.json: Windows GPU engine samples.
- pet-perf.cjs: isolated measurement harness; changes instrumentation only.
- src/renderer/pet-live2d.js: createSession, renderFrame and the mount rAF loop.
