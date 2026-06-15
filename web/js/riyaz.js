// Riyaz: real-time swara tuner. Pick your Sa, sing a note, see the swara.
// All client-side (Web Audio + mic) — no backend, no audio leaves the device.

import { $ } from "./shared.js";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// 12 swaras relative to Sa (Hindustani), in Bhatkhande notation:
// komal -> underline below the letter, tivra -> vertical line above (Ma only).
const SWARAS = [
  { letter: "Sa", variant: "shuddha", desc: "Shadja" },
  { letter: "Re", variant: "komal", desc: "komal Re" },
  { letter: "Re", variant: "shuddha", desc: "Shuddha Re" },
  { letter: "Ga", variant: "komal", desc: "komal Ga" },
  { letter: "Ga", variant: "shuddha", desc: "Shuddha Ga" },
  { letter: "Ma", variant: "shuddha", desc: "Shuddha Ma" },
  { letter: "Ma", variant: "tivra", desc: "tivra Ma" },
  { letter: "Pa", variant: "shuddha", desc: "Pancham" },
  { letter: "Dha", variant: "komal", desc: "komal Dha" },
  { letter: "Dha", variant: "shuddha", desc: "Shuddha Dha" },
  { letter: "Ni", variant: "komal", desc: "komal Ni" },
  { letter: "Ni", variant: "shuddha", desc: "Shuddha Ni" },
];

const LEVELS = {
  // tol: cents window for "in tune"; minClarity / noiseMult: voice gate (softened)
  beginner: { tol: 35, sustainMs: 1500, minClarity: 0.68, noiseMult: 1.55 },
  intermediate: { tol: 20, sustainMs: 1800, minClarity: 0.74, noiseMult: 1.85 },
  expert: { tol: 10, sustainMs: 2200, minClarity: 0.82, noiseMult: 2.15 },
};

// Noise-rejection + stability tuning
const ABS_MIN_RMS = 0.007;
const SILENCE_RMS = 0.004;
const SETTLE_MS = 450;
const HOLD_MS = 320;
const FMIN = 70;
const FMAX = 1100;
const FREQ_RING = 9;
const NOTE_SWITCH_FRAMES = 4;
const NOTE_SWITCH_CENTS = 38;
const CENTS_SMOOTH = 0.82;
const GATE_RMS_CAP = 0.055; // gate never demands louder than this

const SA_MIDI_MIN = 43; // G2
const SA_MIDI_MAX = 62; // D4
const SA_MIDI_DEFAULT = 48; // C3

const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const midiName = (m) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

// --- DOM refs ---
let saSelect, levelGroup, droneToggle, micBtn, micLabel, statusEl, stage,
  octaveEl, swaraEl, westernEl, freqEl, needleEl, zoneEl, centsEl, dirEl,
  sustainEl, sustainLabel, scaleEl;

// --- state ---
let saMidi = SA_MIDI_DEFAULT;
let level = "intermediate";
let audioCtx = null;
let analyser = null;
let micStream = null;
let rafId = null;
let buf = null;
let smoothFreq = 0;
let smoothCents = 0;
let sustainStart = 0;
let droneNodes = null;
let inited = false;

// noise-rejection + pitch-lock state
let noiseFloor = ABS_MIN_RMS;
let settleUntil = 0;
let lastVoiceAt = 0;
let calibrated = false;
let freqRing = [];
let lockedOffset = null; // semitones from Sa (integer)
let candidateOffset = null;
let candidateCount = 0;
let lastRender = null; // last stable UI snapshot for hold

export function init() {
  if (inited) return;
  inited = true;

  saSelect = $("r-sa");
  levelGroup = $("r-level");
  droneToggle = $("r-drone");
  micBtn = $("r-mic");
  micLabel = $("r-mic-label");
  statusEl = $("r-status");
  stage = $("r-stage");
  octaveEl = $("r-octave");
  swaraEl = $("r-swara");
  westernEl = $("r-western");
  freqEl = $("r-freq");
  needleEl = $("r-needle");
  zoneEl = $("r-zone");
  centsEl = $("r-cents");
  dirEl = $("r-dir");
  sustainEl = $("r-sustain");
  sustainLabel = $("r-sustain-label");
  scaleEl = $("r-scale");

  buildSaOptions();
  buildScale();
  applyZoneWidth();

  saSelect.addEventListener("change", () => {
    saMidi = parseInt(saSelect.value, 10);
    lockedOffset = null;
    candidateOffset = null;
    candidateCount = 0;
    smoothCents = 0;
    freqRing = [];
    if (droneNodes) startDrone(); // retune live drone
  });

  levelGroup.querySelectorAll(".seg").forEach((btn) => {
    btn.addEventListener("click", () => {
      level = btn.dataset.level;
      levelGroup.querySelectorAll(".seg").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      applyZoneWidth();
    });
  });

  droneToggle.addEventListener("change", () => {
    if (droneToggle.checked) {
      ensureContext();
      startDrone();
      if (statusEl) statusEl.textContent = "Drone on — use headphones so it doesn't affect detection.";
    } else {
      stopDrone();
    }
  });

  micBtn.addEventListener("click", () => {
    if (micStream) stopListening();
    else startListening();
  });
}

// Called by the router when leaving Riyaz — free the mic + silence the drone.
export function suspend() {
  stopListening();
  stopDrone();
  if (droneToggle) droneToggle.checked = false;
}

function buildSaOptions() {
  saSelect.innerHTML = "";
  for (let m = SA_MIDI_MIN; m <= SA_MIDI_MAX; m += 1) {
    const opt = document.createElement("option");
    opt.value = String(m);
    opt.textContent = `${midiName(m)} · ${midiToFreq(m).toFixed(1)} Hz`;
    if (m === SA_MIDI_DEFAULT) opt.selected = true;
    saSelect.appendChild(opt);
  }
  saMidi = SA_MIDI_DEFAULT;
}

function buildScale() {
  scaleEl.innerHTML = "";
  SWARAS.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = "swara-pip";
    li.dataset.idx = String(i);
    if (s.variant !== "shuddha") li.classList.add("altered");
    li.title = s.desc;
    const mark = document.createElement("span");
    mark.className = `swara-mark ${s.variant}`;
    mark.textContent = s.letter;
    li.appendChild(mark);
    scaleEl.appendChild(li);
  });
}

// Map a frequency to a swara relative to the chosen Sa.
export function frequencyToSwara(freq, saMidiNote) {
  const saFreq = midiToFreq(saMidiNote);
  const n = Math.round(12 * Math.log2(freq / saFreq));
  const nearestMidi = saMidiNote + n;
  const nearestFreq = midiToFreq(nearestMidi);
  const cents = 1200 * Math.log2(freq / nearestFreq);
  const idx = ((n % 12) + 12) % 12;
  const octave = Math.floor(n / 12);
  return {
    idx,
    octave,
    cents,
    swara: SWARAS[idx],
    western: midiName(nearestMidi),
    nearestFreq,
  };
}

function applyZoneWidth() {
  const tol = LEVELS[level].tol; // cents; track spans ±50 cents = 100%
  zoneEl.style.left = `${50 - tol}%`;
  zoneEl.style.width = `${tol * 2}%`;
}

// ---------- Audio context + mic ----------
function ensureContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

async function startListening() {
  try {
    ensureContext();
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const source = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 4096; // finer low-note resolution → fewer harmonic misreads
    buf = new Float32Array(analyser.fftSize);
    source.connect(analyser);

    micBtn.classList.add("on");
    micLabel.textContent = "Stop";
    stage.hidden = false;
    statusEl.textContent = "Calibrating to your room — stay quiet for a moment…";
    smoothFreq = 0;
    smoothCents = 0;
    noiseFloor = ABS_MIN_RMS;
    settleUntil = performance.now() + SETTLE_MS;
    lastVoiceAt = 0;
    calibrated = false;
    freqRing = [];
    lockedOffset = null;
    candidateOffset = null;
    candidateCount = 0;
    lastRender = null;
    loop();
  } catch (err) {
    console.error(err);
    statusEl.textContent =
      err && err.name === "NotAllowedError"
        ? "Microphone blocked. Allow mic access in your browser to use Riyaz."
        : "Couldn't access the microphone on this device.";
  }
}

function stopListening() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  analyser = null;
  if (micBtn) {
    micBtn.classList.remove("on");
    micLabel.textContent = "Start listening";
  }
  if (stage) stage.hidden = true;
  if (statusEl) statusEl.textContent = "Tap “Start listening”, allow your mic, then sing a sustained note.";
}

function loop() {
  rafId = requestAnimationFrame(loop);
  if (!analyser) return;
  analyser.getFloatTimeDomainData(buf);
  const { freq, clarity, rms } = autoCorrelate(buf, audioCtx.sampleRate);
  const now = performance.now();
  const lv = LEVELS[level];

  // Phase 1: learn quiet ambient level only — ignore loud spikes during calibration.
  if (now < settleUntil) {
    if (rms < 0.025) {
      noiseFloor = noiseFloor * 0.88 + rms * 0.12;
    }
    renderIdle();
    return;
  }
  if (!calibrated) {
    calibrated = true;
    noiseFloor = Math.min(noiseFloor, 0.018); // don't inherit an over-estimated floor
    if (statusEl) {
      statusEl.textContent = droneToggle.checked
        ? "Drone on — use headphones so it doesn't affect detection."
        : "Listening… sing a sustained note.";
    }
  }

  const gate = Math.min(
    Math.max(ABS_MIN_RMS, noiseFloor * lv.noiseMult),
    GATE_RMS_CAP,
  );
  const hasPitch = freq >= FMIN && freq <= FMAX;
  // Strong pass: clear tonal signal. Soft pass: slightly weaker but still pitched —
  // lets real singing / phone-speaker tests through without opening the door to noise.
  const strongVoice = hasPitch && rms >= gate && clarity >= lv.minClarity;
  const softVoice = hasPitch && rms >= gate * 0.72 && clarity >= lv.minClarity * 0.88;
  const isVoice = strongVoice || softVoice;

  if (!isVoice) {
    noiseFloor = noiseFloor * 0.96 + Math.min(rms, noiseFloor * 1.5) * 0.04;
    if (now - lastVoiceAt > HOLD_MS) {
      lockedOffset = null;
      candidateOffset = null;
      candidateCount = 0;
      lastRender = null;
      renderIdle();
    } else if (lastRender) {
      paint(lastRender);
    }
    return;
  }

  lastVoiceAt = now;
  const stable = stabilisePitch(freq);
  if (stable) {
    paint(stable);
  } else if (lastRender) {
    paint(lastRender); // show provisional reading while the median buffer fills
  }
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Fold raw detection into singing range, median-filter, then lock swara with hysteresis.
function stabilisePitch(rawFreq) {
  const folded = foldFundamental(rawFreq);
  freqRing.push(folded);
  if (freqRing.length > FREQ_RING) freqRing.shift();

  const med = freqRing.length >= 3 ? median(freqRing) : folded;
  smoothFreq = smoothFreq ? smoothFreq * 0.6 + med * 0.4 : med;

  const offset = Math.round(12 * Math.log2(smoothFreq / midiToFreq(saMidi)));

  if (lockedOffset === null) {
    lockedOffset = offset;
    candidateOffset = null;
    candidateCount = 0;
  } else if (offset !== lockedOffset) {
    const lockedTarget = midiToFreq(saMidi + lockedOffset);
    const centsFromLocked = 1200 * Math.log2(smoothFreq / lockedTarget);
    if (Math.abs(centsFromLocked) >= NOTE_SWITCH_CENTS) {
      if (candidateOffset === offset) candidateCount += 1;
      else { candidateOffset = offset; candidateCount = 1; }
      if (candidateCount >= NOTE_SWITCH_FRAMES) {
        lockedOffset = offset;
        candidateOffset = null;
        candidateCount = 0;
        smoothCents = 0;
      }
    } else {
      candidateOffset = null;
      candidateCount = 0;
    }
  } else {
    candidateOffset = null;
    candidateCount = 0;
  }

  const lockedMidi = saMidi + lockedOffset;
  const lockedTarget = midiToFreq(lockedMidi);
  const cents = 1200 * Math.log2(smoothFreq / lockedTarget);
  smoothCents = smoothCents ? smoothCents * CENTS_SMOOTH + cents * (1 - CENTS_SMOOTH) : cents;

  const idx = ((lockedOffset % 12) + 12) % 12;
  const octave = Math.floor(lockedOffset / 12);

  lastRender = {
    idx,
    octave,
    cents: smoothCents,
    swara: SWARAS[idx],
    western: midiName(lockedMidi),
    freq: smoothFreq,
  };
  return lastRender;
}

function foldFundamental(freq) {
  let f = freq;
  while (f > FMAX * 1.02) f /= 2;
  while (f < FMIN * 0.98) f *= 2;
  return f;
}

function renderIdle() {
  swaraEl.textContent = "—";
  swaraEl.className = "swara-name";
  swaraEl.style.color = "";
  octaveEl.textContent = "";
  westernEl.textContent = "—";
  freqEl.textContent = "— Hz";
  centsEl.textContent = "0";
  dirEl.textContent = "";
  needleEl.style.left = "50%";
  needleEl.style.background = "rgba(255,255,255,0.4)";
  sustainEl.style.setProperty("--fill", "0deg");
  sustainEl.classList.remove("done");
  sustainLabel.textContent = "sing";
  scaleEl.querySelectorAll(".swara-pip").forEach((el) => el.classList.remove("active"));
  sustainStart = 0;
}

function paint({ idx, octave, cents, swara, western, freq }) {
  const tol = LEVELS[level].tol;
  const color = centsColor(cents, tol);

  swaraEl.textContent = swara.letter;
  swaraEl.className = `swara-name swara-mark ${swara.variant}`;
  swaraEl.style.color = color;
  swaraEl.title = swara.desc;
  octaveEl.textContent = octave === 0 ? "" : "•".repeat(Math.min(2, Math.abs(octave)));
  octaveEl.className = `swara-octave ${octave > 0 ? "above" : octave < 0 ? "below" : ""}`;
  westernEl.textContent = western;
  freqEl.textContent = `${freq.toFixed(1)} Hz`;

  const rounded = Math.round(cents);
  centsEl.textContent = rounded > 0 ? `+${rounded}` : `${rounded}`;
  dirEl.textContent = Math.abs(rounded) <= tol ? "in tune" : rounded < 0 ? "♭ flat" : "♯ sharp";
  dirEl.style.color = color;

  needleEl.style.left = `${Math.max(0, Math.min(100, 50 + cents))}%`;
  needleEl.style.background = color;

  scaleEl.querySelectorAll(".swara-pip").forEach((el) => {
    const on = Number(el.dataset.idx) === idx;
    el.classList.toggle("active", on);
    if (on) el.style.setProperty("--pip", color);
  });

  if (Math.abs(cents) <= tol) {
    if (!sustainStart) sustainStart = performance.now();
    const held = performance.now() - sustainStart;
    const pct = Math.min(1, held / LEVELS[level].sustainMs);
    sustainEl.style.setProperty("--fill", `${pct * 360}deg`);
    if (pct >= 1) {
      sustainEl.classList.add("done");
      sustainLabel.textContent = "steady ✓";
    } else {
      sustainEl.classList.remove("done");
      sustainLabel.textContent = "hold…";
    }
  } else {
    sustainStart = 0;
    sustainEl.style.setProperty("--fill", "0deg");
    sustainEl.classList.remove("done");
    sustainLabel.textContent = "hold steady";
  }
}

// hue 130 (green) when in tune -> 0 (red) as deviation grows past ~3x tolerance.
function centsColor(cents, tol) {
  const ratio = Math.min(1, Math.max(0, (Math.abs(cents) - tol) / (tol * 2)));
  const hue = 130 - ratio * 130;
  return `hsl(${hue}, 80%, 58%)`;
}

// ---------- Sa drone (Sa-Pa-Sa reference) ----------
function startDrone() {
  stopDrone();
  ensureContext();
  const saFreq = midiToFreq(saMidi);
  const voices = [saFreq / 2, saFreq, saFreq * 2 ** (7 / 12)]; // mandra Sa, Sa, Pa
  const master = audioCtx.createGain();
  master.gain.value = 0.0;
  master.connect(audioCtx.destination);
  master.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.4);

  const oscs = voices.map((f) => {
    const osc = audioCtx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f;
    const g = audioCtx.createGain();
    g.gain.value = 0.5;
    osc.connect(g).connect(master);
    osc.start();
    return osc;
  });
  droneNodes = { master, oscs };
}

function stopDrone() {
  if (!droneNodes) return;
  const { master, oscs } = droneNodes;
  try {
    master.gain.cancelScheduledValues(audioCtx.currentTime);
    master.gain.linearRampToValueAtTime(0.0, audioCtx.currentTime + 0.2);
    oscs.forEach((o) => o.stop(audioCtx.currentTime + 0.25));
  } catch (_e) {
    /* already stopped */
  }
  droneNodes = null;
}

// ---------- Pitch detection (autocorrelation + parabolic interpolation) ----------
function autoCorrelate(b, sampleRate) {
  const SIZE = b.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i += 1) rms += b[i] * b[i];
  rms = Math.sqrt(rms / SIZE);
  // Report rms even when there's no pitch, so the noise-floor tracker can learn.
  const NONE = { freq: -1, clarity: 0, rms };
  if (rms < SILENCE_RMS) return NONE;

  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i += 1) {
    if (Math.abs(b[i]) < thres) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i += 1) {
    if (Math.abs(b[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  }

  const trimmed = b.subarray(r1, r2);
  const n = trimmed.length;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n - i; j += 1) c[i] += trimmed[j] * trimmed[j + i];
  }

  const minLag = Math.floor(sampleRate / FMAX);
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / FMIN));

  let d = minLag;
  while (d < maxLag && c[d] > c[d + 1]) d += 1;

  // Pick the strongest peak in the singing range; prefer lower lag (fundamental)
  // when two peaks are close in strength — stops octave-hopping on phone speakers.
  let bestLag = -1;
  let bestVal = -1;
  for (let i = d; i <= maxLag; i += 1) {
    if (c[i] <= 0) continue;
    const score = c[i] * (1 + 0.08 * (maxLag - i) / maxLag);
    if (score > bestVal) {
      bestVal = score;
      bestLag = i;
    }
  }
  if (bestLag <= 0) return NONE;

  // Prefer the fundamental when harmonics are equally strong (phone speaker → mic).
  let fundLag = bestLag;
  while (fundLag * 2 <= maxLag && c[fundLag * 2] >= c[fundLag] * 0.88) {
    fundLag *= 2;
  }
  bestLag = fundLag;

  const clarity = c[0] > 0 ? c[bestLag] / c[0] : 0;

  let T0 = bestLag;
  const x1 = c[T0 - 1] || 0;
  const x2 = c[T0];
  const x3 = c[T0 + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const bb = (x3 - x1) / 2;
  if (a) T0 -= bb / (2 * a);

  return { freq: sampleRate / T0, clarity, rms };
}

// expose math for quick verification in dev console
window.riyazDebug = { frequencyToSwara, midiToFreq, midiName, autoCorrelate, foldFundamental, stabilisePitch };
