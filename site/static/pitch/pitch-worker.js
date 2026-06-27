/* SwarPractice pitch worker — YIN + McLeod merge, Sa-aware octave. */

var module = { exports: {} };
var exports = module.exports;

importScripts("/static/pitch/vendor/essentia-wasm.umd.js");
const EssentiaWASM = exports.EssentiaWASM;

importScripts(
  "/static/pitch/vendor/essentia.js-core.umd.min.js",
  "/static/pitch/mcleod-worker.js",
);
const Essentia = module.exports;

const FRAME_SIZE = 4096;
const HOP = 2048;
const FMIN = 45;
const FMAX = 1100;
const SILENCE_RMS = 0.004;

let essentia = null;
let sampleRate = 44100;
let saFreq = 130.81;
let ring = new Float32Array(FRAME_SIZE * 2);
let ringWrite = 0;
let ringFilled = 0;
let samplesSinceHop = 0;
let active = true;

function pushRing(samples) {
  for (let i = 0; i < samples.length; i += 1) {
    ring[ringWrite] = samples[i];
    ringWrite = (ringWrite + 1) % ring.length;
    ringFilled = Math.min(ringFilled + 1, ring.length);
  }
}

function getWindow(size) {
  if (ringFilled < size) return null;
  const out = new Float32Array(size);
  let start = (ringWrite - size + ring.length) % ring.length;
  for (let i = 0; i < size; i += 1) {
    out[i] = ring[(start + i) % ring.length];
  }
  return out;
}

function rmsOf(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i += 1) s += arr[i] * arr[i];
  return Math.sqrt(s / arr.length);
}

/**
 * YIN often reports 2× the vocal fundamental. McLeod tends to find the true F0.
 * When they disagree by ~one octave, trust McLeod.
 */
function mergeDetections(yinFreq, yinConf, mcleod) {
  const mFreq = mcleod.freq;
  const mConf = mcleod.confidence;

  if (mFreq <= 0 && yinFreq <= 0) return { freq: -1, confidence: 0, source: "none" };
  if (mFreq <= 0) return { freq: yinFreq, confidence: yinConf, source: "yin" };
  if (yinFreq <= 0) return { freq: mFreq, confidence: mConf, source: "mcleod" };

  const ratio = yinFreq / mFreq;
  if (ratio > 1.62 && ratio < 2.38 && mConf >= 0.42) {
    return {
      freq: mFreq,
      confidence: Math.max(mConf, yinConf * 0.85),
      source: "mcleod-f0",
    };
  }
  if (ratio > 0.72 && ratio < 1.38) {
    const useYin = yinConf >= mConf;
    return {
      freq: useYin ? yinFreq : mFreq,
      confidence: Math.max(yinConf, mConf),
      source: useYin ? "yin" : "mcleod",
    };
  }

  return { freq: mFreq, confidence: mConf, source: "mcleod" };
}

function runPitchYin(window) {
  const vector = essentia.arrayToVector(window);
  const out = essentia.PitchYin(vector, FRAME_SIZE, true, FMAX, FMIN, sampleRate, 0.15);
  const freq = out.pitch;
  const confidence = out.pitchConfidence;
  vector.delete();
  return { freq, confidence };
}

function analyze() {
  const frame = getWindow(FRAME_SIZE);
  if (!frame) return;

  const rms = rmsOf(frame);
  if (rms < SILENCE_RMS) {
    postMessage({ type: "frame", rms, freq: -1, confidence: 0, source: "silence" });
    return;
  }

  const yin = runPitchYin(frame);
  const mcleod = self.mcleodPitch(frame, sampleRate, FMIN, FMAX);
  const merged = mergeDetections(yin.freq, yin.confidence, mcleod);

  postMessage({
    type: "frame",
    rms,
    freq: merged.freq,
    confidence: merged.confidence,
    source: merged.source,
  });
}

async function initEssentia() {
  await EssentiaWASM.ready;
  essentia = new Essentia(EssentiaWASM);
  postMessage({ type: "ready", version: essentia.version });
}

onmessage = (event) => {
  const msg = event.data;
  if (msg.type === "init") {
    initEssentia().catch((err) => postMessage({ type: "error", message: String(err) }));
    return;
  }
  if (msg.type === "config") {
    if (msg.sampleRate) sampleRate = msg.sampleRate;
    if (msg.saFreq > 0) saFreq = msg.saFreq;
    return;
  }
  if (msg.type === "stop") {
    active = false;
    return;
  }
  if (msg.type === "start") {
    active = true;
    ringWrite = 0;
    ringFilled = 0;
    samplesSinceHop = 0;
    return;
  }
  if (msg.type === "samples" && active) {
    pushRing(msg.samples);
    samplesSinceHop += msg.samples.length;
    if (ringFilled >= FRAME_SIZE && samplesSinceHop >= HOP) {
      samplesSinceHop = 0;
      analyze();
    }
  }
};
