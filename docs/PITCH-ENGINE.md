# SwarPractice Pitch Engine v2

Parked pitch-worker pipeline for SwarPractice (browser-first, Android-ready via Capacitor).

SwarPractice's active launch path is documented in `docs/MILAP-ARCHITECTURE.md` and currently uses `web/js/pitch/detect.js` plus `web/js/pitch/stabilizer.js` directly from `web/js/milap.js`. Keep this worker path as the Phase 2 option after the active notation pipeline is stable.

## Stack

| Layer | Technology |
|---|---|
| Capture | `AudioWorklet` (`/static/pitch/capture-processor.js`) |
| Primary detection | **Essentia PitchYin** (per-frame YIN, WASM) |
| Octave / ambiguity | **Essentia PitchYinProbabilistic** (pYIN on sliding window) |
| Fallback | **McLeod NSDF** (pure JS) |
| Stabilizer | Sa-relative swara + saptak lock (`web/js/pitch/stabilizer.js`) |
| Threading | Web Worker (`/static/pitch/pitch-worker.js`) |

Live tuning is **100% on-device**. No audio is sent to the SwarSaathi backend.

## Files

```
web/js/pitch/
  constants.js      — shared Hz / saptak constants
  stabilizer.js     — swara lock + saptak mapping
  mcleod.js           — McLeod fallback (module; worker uses mcleod-worker.js)
  pitch-engine.js     — main-thread API

web/pitch/
  capture-processor.js
  pitch-worker.js
  mcleod-worker.js
  vendor/
    essentia-wasm.web.js
    essentia-wasm.web.wasm
    essentia.js-core.umd.min.js
```

## Setup (after clone)

```bash
cd web
npm install
npm run vendor:essentia
```

`vendor:essentia` copies Essentia WASM assets into `static/pitch/vendor/`.

## Run locally

```bash
cd ..
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8004
```

Open http://127.0.0.1:8004/ — hard refresh (`Cmd+Shift+R`) after JS changes.

## Acceptance (ear test before re-enabling polish)

1. Sa madhya — correct swara + **Madhya saptak**
2. Brief pause (~0.5 s)
3. Sa taar — correct swara + **Taar saptak**
4. Repeat for Re, Ga, Pa across saptaks
5. Free mode + timed mode + pause/resume

## Next (not yet)

- CREPE tiny ONNX as secondary fallback for noisy environments
- Capacitor Android shell sharing the same worker bundle
- Automated Hz → swara unit tests
