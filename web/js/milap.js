// SwarPractice — real-time swara tuner with session drills. Client-side mic only.

import { $ } from "./shared.js";
import { autoCorrelate } from "./pitch/detect.js";
import { PitchStabilizer, formatSaptakLabel, midiName, midiToFreq } from "./pitch/stabilizer.js";
import { FMIN, FMAX, applyVocalOctaveCorrection } from "./pitch/constants.js";
import { deleteRecording, listRecordings, saveRecording, shareRecording } from "./recordings.js";

const SWARAS = [
  { idx: 0, letter: "Sa", variant: "shuddha", label: "Sa", desc: "Shadja" },
  { idx: 1, letter: "Re", variant: "komal", label: "Re (komal)", desc: "komal Re" },
  { idx: 2, letter: "Re", variant: "shuddha", label: "Re", desc: "Shuddha Re" },
  { idx: 3, letter: "Ga", variant: "komal", label: "Ga (komal)", desc: "komal Ga" },
  { idx: 4, letter: "Ga", variant: "shuddha", label: "Ga", desc: "Shuddha Ga" },
  { idx: 5, letter: "Ma", variant: "shuddha", label: "Ma", desc: "Shuddha Ma" },
  { idx: 6, letter: "Ma", variant: "tivra", label: "Ma (tivra)", desc: "tivra Ma" },
  { idx: 7, letter: "Pa", variant: "shuddha", label: "Pa", desc: "Pancham" },
  { idx: 8, letter: "Dha", variant: "komal", label: "Dha (komal)", desc: "komal Dha" },
  { idx: 9, letter: "Dha", variant: "shuddha", label: "Dha", desc: "Shuddha Dha" },
  { idx: 10, letter: "Ni", variant: "komal", label: "Ni (komal)", desc: "komal Ni" },
  { idx: 11, letter: "Ni", variant: "shuddha", label: "Ni", desc: "Shuddha Ni" },
];

const OCTAVE_LABELS = { "-1": "mandra", 0: "madhya", 1: "taar" };

const LEVELS = {
  beginner: { tol: 35, minClarity: 0.62, noiseMult: 1.35, stabilityRef: 42 },
  intermediate: { tol: 20, minClarity: 0.68, noiseMult: 1.55, stabilityRef: 34 },
  expert: { tol: 12, minClarity: 0.76, noiseMult: 1.85, stabilityRef: 26 },
};

const ABS_MIN_RMS = 0.0024;
const SILENCE_RMS = 0.0028;
const SETTLE_MS = 420;
const GATE_RMS_CAP = 0.04;
const DISPLAY_HOLD_MS = 1100;
const IOS_DISPLAY_HOLD_MS = 1600;
const STALE_DISPLAY_MS = 4000;
const IOS_STALE_DISPLAY_MS = 12000;

const SA_MIDI_MIN = 41;
const SA_MIDI_MAX = 62;
const SA_MIDI_DEFAULT = 48;

const WAVE_WINDOW_SEC = 12;
const WAVE_Y_CENTS = 70;
const WAVE_STEADY_CENTS = 5;
const WAVE_SAMPLE_SEC = 0.1;
const WAVE_TRACE_EMA = 0.93;
const WAVE_SLEW_CENTS = 1.8;
const SCORE_ATTACK_IGNORE_SEC = 0.55;

const TAALS = {
  teentaal: { label: "Teentaal", beats: 16, accent: [0, 4, 8, 12] },
  keharwa: { label: "Keharwa", beats: 8, accent: [0, 4] },
  dadra: { label: "Dadra", beats: 6, accent: [0, 3] },
  ektaal: { label: "Ektaal", beats: 12, accent: [0, 2, 4, 6, 8, 10] },
  rupak: { label: "Rupak", beats: 7, accent: [0, 3, 5] },
};

const TANPURA_BASE_URL = "https://assets.swarsaathi.com";
const TANPURA_LOCAL_BASE_URL = "/static/audio/tanpura-optimized";
const PREFS_KEY = "swarsaathi:practice-prefs:v1.2";
const MIC_CONSENT_KEY = "swarsaathi:mic-consent:v1.2";

/** @type {Record<string, Record<number, string>>} */
let TANPURA_FILES = {
  "Sa-Pa": {
    33: "A1.mp3",
    42: "F-sharp2.mp3", 43: "G2.mp3", 44: "G-sharp2.mp3", 45: "A2.mp3", 46: "A-sharp2.mp3", 47: "B2.mp3",
    48: "C3.mp3", 49: "C-sharp3.mp3", 50: "D3.mp3", 51: "D-sharp3.mp3", 52: "E3.mp3", 53: "F3.mp3",
  },
  "Sa-ma": {
    38: "D2.mp3", 41: "F2.mp3", 42: "F-sharp2.mp3", 43: "G2.mp3", 44: "G-sharp2.mp3", 45: "A2.mp3", 46: "A-sharp2.mp3", 47: "B2.mp3",
    48: "C3.mp3", 49: "C-sharp3.mp3", 50: "D3.mp3", 51: "D-sharp3.mp3", 52: "E3.mp3",
  },
};

/** @type {Set<string>} */
let TANPURA_LOCAL = new Set();

async function loadTanpuraManifest() {
  try {
    const response = await fetch(`${TANPURA_LOCAL_BASE_URL}/manifest.json`, { cache: "no-cache" });
    if (!response.ok) return;
    const manifest = await response.json();
    const next = { "Sa-Pa": {}, "Sa-ma": {} };
    const local = new Set();
    for (const asset of manifest.assets || []) {
      const mode = asset.mode;
      const midi = Number(asset.midi);
      if (!next[mode] || !Number.isFinite(midi)) continue;
      const remoteName = String(asset.filename || "").replace(/\.m4a$/i, ".mp3");
      next[mode][midi] = remoteName;
      local.add(`${mode}/${midi}`);
    }
    if (Object.keys(next["Sa-Pa"]).length || Object.keys(next["Sa-ma"]).length) {
      TANPURA_FILES = next;
      TANPURA_LOCAL = local;
      updatePitchAvailability();
    }
  } catch (_err) {
    // Keep static fallback map if the optimized manifest is unavailable.
  }
}

function savePracticePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      saMidi,
      sessionMode,
      sessionSec,
      tanpuraMode: tanpuraMode(),
      strictness,
      sensitivity,
      recordSession: Boolean($("m-record-session")?.checked),
    }));
  } catch (_err) { /* ignore quota / private mode */ }
}

function restorePracticePrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return;
    const prefs = JSON.parse(raw);
    if (Number.isFinite(prefs.saMidi)) {
      saMidi = prefs.saMidi;
      const sel = $("m-sa");
      if (sel) sel.value = String(saMidi);
    }
    if (prefs.tanpuraMode && tanpuraModeSelect) tanpuraModeSelect.value = prefs.tanpuraMode;
    if (prefs.strictness) {
      strictness = prefs.strictness;
      const strict = $("m-strict");
      if (strict) strict.value = prefs.strictness;
    }
    if (Number.isFinite(prefs.sensitivity)) {
      sensitivity = prefs.sensitivity;
      const range = $("m-sensitivity");
      if (range) range.value = String(prefs.sensitivity);
    }
    if (prefs.sessionMode === "free" || prefs.sessionMode === "timed") {
      sessionMode = prefs.sessionMode;
      sessionSec = sessionMode === "free" ? 0 : (Number(prefs.sessionSec) || 5);
      $("m-duration")?.querySelectorAll(".chip").forEach((chip) => {
        const isFree = chip.dataset.mode === "free";
        const match = sessionMode === "free"
          ? isFree
          : !isFree && Number(chip.dataset.sec) === sessionSec;
        chip.classList.toggle("active", match);
      });
    }
    if (typeof prefs.recordSession === "boolean" && $("m-record-session")) {
      $("m-record-session").checked = prefs.recordSession;
    }
    $("m-live-stat").textContent = formatReadyStat();
    updatePitchAvailability();
  } catch (_err) { /* ignore corrupt prefs */ }
}

let saMidi = SA_MIDI_DEFAULT;
let strictness = "intermediate";
let sensitivity = 3;
let lowerMicOctave = false;
let targetMode = "any";
let targetSwaraIdx = 3;
let targetOctave = 0;

let sessionMode = "timed";
let sessionSec = 5;
let sessionActive = false;
let sessionPaused = false;
let pausedElapsedSec = 0;
let sessionSamples = [];
let sessionStart = 0;
let lastWaveSampleT = -1;
let displayWaveCents = NaN;
let waveTraceActive = false;
let lastListenStopAt = 0;
let warmCalibration = false;

let audioCtx = null;
let micStream = null;
let micSource = null;
let analyser = null;
let buf = null;
let micSink = null;
let rafId = null;
let stabilizer = null;
let droneNodes = null;
let tanpuraAudio = null;
let referenceNodes = null;
let metronomeTimer = null;
let metronomeBeat = 0;
let sessionRecorder = null;
let sessionRecordingChunks = [];
let sessionRecordingStartedAt = 0;
let inited = false;

let noiseFloor = ABS_MIN_RMS;
let settleUntil = 0;
let lastVoiceAt = 0;
let lastDisplayVoiceAt = 0;
let lastMicHintAt = 0;
let calibrated = false;
let lastRender = null;

let waveCanvas, waveCtx, summaryCanvas, summaryCtx;
let milapView;
let droneToggle;
let tanpuraToggle, tanpuraModeSelect, metronomeToggle, taalSelect, bpmInput, bpmValue, tablaToggle, panelPractice, panelAccomp, panelRecordings, accompBar, accompSummary;
let octaveToggle;

function isContinuousSession() {
  return sessionMode === "free";
}

function sessionSummaryDuration() {
  if (!sessionSamples.length) return sessionSec || 0;
  return Math.round(sessionSamples[sessionSamples.length - 1].t);
}

function formatReadyStat() {
  if (sessionPaused) return "Paused — tap Start to resume";
  if (isContinuousSession()) return "Ready · free practice — tap Start, Stop to review";
  return `Ready · ${sessionSec}s drill — tap Start, Stop & review when done`;
}

function setDurationChipsLocked(locked) {
  $("m-duration").querySelectorAll(".chip").forEach((chip) => {
    chip.disabled = locked;
  });
}

function updateLiveProgress(elapsed, inTunePct) {
  const live = $("m-live");
  const barWrap = live?.querySelector(".live-bar-wrap");
  const bar = $("m-live-bar");
  if (!barWrap || !bar) return;
  if (isContinuousSession()) {
    barWrap.classList.add("is-continuous");
    bar.style.width = "100%";
    $("m-live-stat").textContent = `${Math.round(elapsed)}s · ${inTunePct}% in tune`;
    return;
  }
  barWrap.classList.remove("is-continuous");
  bar.style.width = `${Math.min(100, (elapsed / sessionSec) * 100)}%`;
  $("m-live-stat").textContent = `${Math.round(elapsed)}s · ${inTunePct}% in tune`;
}

function getTolerance() {
  return LEVELS[strictness]?.tol ?? 20;
}

function getGateParams() {
  const base = LEVELS[strictness] || LEVELS.intermediate;
  const sensDelta = sensitivity - 3;
  return {
    tol: base.tol,
    minClarity: Math.max(0.55, base.minClarity - sensDelta * 0.025),
    noiseMult: base.noiseMult * (1 - sensDelta * 0.075),
  };
}

function isIosNativeShell() {
  const capPlatform = window.Capacitor?.getPlatform?.();
  if (capPlatform) return capPlatform === "ios";
  return Boolean(window.Capacitor) && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function displayHoldMs() {
  return isIosNativeShell() ? IOS_DISPLAY_HOLD_MS : DISPLAY_HOLD_MS;
}

function staleDisplayMs() {
  return isIosNativeShell() ? IOS_STALE_DISPLAY_MS : STALE_DISPLAY_MS;
}

function displayEnergyGate() {
  if (isIosNativeShell()) return Math.max(0.00055, noiseFloor * 0.95);
  return Math.max(ABS_MIN_RMS * 0.36, noiseFloor * 1.05);
}

function detectionSilenceRms() {
  return isIosNativeShell() ? 0.0005 : SILENCE_RMS * 0.45;
}

function voiceGate(gateParams) {
  if (isIosNativeShell()) {
    return Math.min(Math.max(0.00065, noiseFloor * gateParams.noiseMult * 0.36), 0.018);
  }
  return Math.min(Math.max(ABS_MIN_RMS * 0.75, noiseFloor * gateParams.noiseMult), GATE_RMS_CAP);
}

function voiceMinClarity(gateParams) {
  if (isIosNativeShell()) return Math.max(0.36, gateParams.minClarity * 0.72);
  return gateParams.minClarity;
}

function saptakClass(tier = 0) {
  if (tier < 0) return "saptak-mandra";
  if (tier > 0) return "saptak-taar";
  return "saptak-madhya";
}

function swaraMarkHtml(sw, tier = 0) {
  return `<span class="swara-token ${saptakClass(tier)}"><span class="swara-mark ${sw.variant}">${sw.letter}</span></span>`;
}

function formatTargetLabel() {
  if (targetMode === "any") return "Any (free practice)";
  return `${SWARAS[targetSwaraIdx].desc} · ${OCTAVE_LABELS[String(targetOctave)]}`;
}

function getScoringMidi() {
  if (targetMode === "any" && lastRender) return lastRender.lockedMidi;
  return saMidi + targetSwaraIdx + targetOctave * 12;
}

function scoringCents(render) {
  if (!render) return displayWaveCents;
  if (targetMode === "any") return render.cents;
  const targetFreq = midiToFreq(saMidi + targetSwaraIdx + targetOctave * 12);
  return 1200 * Math.log2(render.freq / targetFreq);
}

function resetPitchState() {
  displayWaveCents = NaN;
  lastWaveSampleT = -1;
  waveTraceActive = false;
  stabilizer?.reset();
  lastRender = null;
}

function resetPracticeReady() {
  sessionPaused = false;
  pausedElapsedSec = 0;
  $("m-summary").hidden = true;
  $("m-live").hidden = false;
  sessionSamples = [];
  resetPitchState();
  drawWave(waveCtx, waveCanvas, [], getTolerance());
  renderIdle();
  $("m-live-stat").textContent = formatReadyStat();
  $("m-status").hidden = false;
  $("m-status").textContent = isContinuousSession()
    ? "Tap Start to practice again."
    : "Tap Start listening, then sing your target note.";
}

function onTargetSwara(render) {
  if (!render || targetMode === "any") return true;
  return render.idx === targetSwaraIdx && render.saptak === targetOctave;
}

function centsColor(cents, tol) {
  const ratio = Math.min(1, Math.max(0, (Math.abs(cents) - tol) / (tol * 2)));
  return `hsl(${130 - ratio * 130}, 80%, 58%)`;
}

export function init() {
  if (inited) return;
  inited = true;

  milapView = document.querySelector(".milap-view");
  document.querySelector(".milap-top-controls")?.after(document.querySelector(".milap-bottom"));

  waveCanvas = $("m-wave");
  waveCtx = waveCanvas.getContext("2d");
  summaryCanvas = $("m-summary-wave");
  summaryCtx = summaryCanvas.getContext("2d");
  droneToggle = $("m-drone");
  tanpuraToggle = $("m-tanpura");
  tanpuraModeSelect = $("m-tanpura-mode");
  metronomeToggle = $("m-metronome");
  taalSelect = $("m-taal");
  bpmInput = $("m-bpm");
  bpmValue = $("m-bpm-val");
  tablaToggle = $("m-tabla");
  accompBar = $("m-accomp-bar");
  accompSummary = $("m-accomp-summary");
  panelPractice = $("m-panel-practice");
  panelAccomp = $("m-panel-accomp");
  panelRecordings = $("m-panel-recordings");
  octaveToggle = $("m-octave-correct");
  lowerMicOctave = octaveToggle?.checked ?? false;

  stabilizer = new PitchStabilizer({ saMidi, swaras: SWARAS });

  buildSaOptions();
  buildTargetGrid();
  targetMode = "any";
  updateTargetUi();
  restorePracticePrefs();
  stabilizer?.setSaMidi(saMidi);
  bindEvents();
  renderIdle();
  drawWave(waveCtx, waveCanvas, [], getTolerance());
  updateReferenceUi();
  renderRecordings();
  initOnboarding();
  loadTanpuraManifest();
}

export function suspend() {
  stopListening({ saveRecording: false });
  stopDrone();
  stopTanpura();
  stopReferenceNote();
  stopMetronome();
  if (droneToggle) droneToggle.checked = false;
  if (tanpuraToggle) tanpuraToggle.checked = false;
  if (metronomeToggle) metronomeToggle.checked = false;
  closeTargetSheet();
}

function buildSaOptions() {
  const sel = $("m-sa");
  sel.innerHTML = "";
  for (let m = SA_MIDI_MIN; m <= SA_MIDI_MAX; m += 1) {
    const opt = document.createElement("option");
    opt.value = String(m);
    opt.textContent = `${midiName(m)} (${midiToFreq(m).toFixed(1)} Hz)`;
    if (m === SA_MIDI_DEFAULT) opt.selected = true;
    sel.appendChild(opt);
  }
  saMidi = SA_MIDI_DEFAULT;
  updatePitchAvailability();
}

function tanpuraMode() {
  return tanpuraModeSelect?.value || "Sa-Pa";
}

function tanpuraFileFor(midi = saMidi, mode = tanpuraMode()) {
  return TANPURA_FILES[mode]?.[midi] || null;
}

function nearestSupportedPitch(mode = tanpuraMode()) {
  const keys = Object.keys(TANPURA_FILES[mode] || {}).map(Number).sort((a, b) => a - b);
  if (!keys.length) return SA_MIDI_DEFAULT;
  return keys.reduce((best, cur) => Math.abs(cur - saMidi) < Math.abs(best - saMidi) ? cur : best, keys[0]);
}

function updatePitchAvailability() {
  const sel = $("m-sa");
  if (!sel) return;
  const requiresTanpuraPitch = Boolean(tanpuraToggle?.checked || milapView?.classList.contains("accomp-mode"));
  const mode = tanpuraMode();
  Array.from(sel.options).forEach((opt) => {
    const midi = parseInt(opt.value, 10);
    const hasLoop = Boolean(tanpuraFileFor(midi, mode));
    opt.disabled = requiresTanpuraPitch && !hasLoop;
    opt.textContent = `${midiName(midi)} (${midiToFreq(midi).toFixed(1)} Hz)${requiresTanpuraPitch && !hasLoop ? " · no tanpura" : ""}`;
  });
}

function ensureSupportedTanpuraPitch({ announce = false } = {}) {
  const needsLoop = Boolean(tanpuraToggle?.checked || milapView?.classList.contains("accomp-mode"));
  if (!needsLoop || tanpuraFileFor()) return;
  const next = nearestSupportedPitch();
  $("m-sa").value = String(next);
  saMidi = next;
  stabilizer?.setSaMidi(saMidi);
  resetPitchState();
  if (announce) $("m-status").textContent = `Your Pitch moved to ${midiName(saMidi)} because ${tanpuraMode()} has no loop for the previous pitch.`;
}

function buildTargetGrid() {
  const grid = $("m-target-grid");
  grid.innerHTML = "";
  SWARAS.forEach((sw) => {
    const row = document.createElement("div");
    row.className = "target-grid-row";
    row.innerHTML = `<span class="target-row-label">${sw.label}</span>`;
    [-1, 0, 1].forEach((oct) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "target-cell";
      btn.dataset.swara = String(sw.idx);
      btn.dataset.octave = String(oct);
      btn.innerHTML = swaraMarkHtml(sw, oct);
      btn.title = `${sw.desc} · ${OCTAVE_LABELS[String(oct)]}`;
      btn.addEventListener("click", () => selectTarget(sw.idx, oct));
      row.appendChild(btn);
    });
    grid.appendChild(row);
  });
}

function updateTargetUi() {
  $("m-target-label").textContent = formatTargetLabel();
  document.querySelectorAll(".target-cell").forEach((cell) => {
    const on = targetMode === "swara"
      && parseInt(cell.dataset.swara, 10) === targetSwaraIdx
      && parseInt(cell.dataset.octave, 10) === targetOctave;
    cell.classList.toggle("active", on);
  });
  updateReferenceUi();
}

function setMilapPanel(target) {
  const isAccomp = target === "accomp";
  const isRecordings = target === "recordings";
  document.querySelectorAll("[data-m-panel]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mPanel === target);
    if (btn.dataset.mPanel === target) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  if (panelPractice) panelPractice.hidden = target !== "practice";
  if (panelAccomp) panelAccomp.hidden = !isAccomp;
  if (panelRecordings) panelRecordings.hidden = !isRecordings;
  milapView?.classList.toggle("accomp-mode", isAccomp);
  milapView?.classList.toggle("recordings-mode", isRecordings);
  ensureSupportedTanpuraPitch({ announce: isAccomp });
  updatePitchAvailability();
  if (isAccomp) {
    closeTargetSheet();
    if (!tanpuraToggle?.checked && !metronomeToggle?.checked) {
      $("m-status").textContent = "Accompaniment mode — set tanpura, metronome, cycle, and BPM.";
    }
  } else if (isRecordings) {
    closeTargetSheet();
    $("m-status").textContent = "Recordings are stored only on this device.";
    renderRecordings();
  } else {
    $("m-status").textContent = formatReadyStat();
  }
  updateAccompanimentUi();
}

function closeTargetSheet() {
  $("m-target-sheet").hidden = true;
  $("m-target-trigger").setAttribute("aria-expanded", "false");
}

function openTargetSheet() {
  $("m-target-sheet").hidden = false;
  $("m-target-trigger").setAttribute("aria-expanded", "true");
}

function selectTarget(swaraIdx, octave) {
  stopReferenceNote();
  if (swaraIdx === "any") targetMode = "any";
  else {
    targetMode = "swara";
    targetSwaraIdx = swaraIdx;
    targetOctave = octave;
  }
  updateTargetUi();
  closeTargetSheet();
}

function paintReadout(render, centsForColor = null) {
  const tol = getTolerance();
  if (!render) {
    renderIdle();
    return;
  }
  const sw = render.swara;
  const c = centsColor(centsForColor ?? render.cents, tol);
  const letterEl = $("m-letter");
  const tier = render.saptak;
  letterEl.innerHTML = swaraMarkHtml(sw, tier);
  letterEl.className = "milap-swara-name";
  letterEl.style.color = c;

  $("m-saptak").textContent = formatSaptakLabel(tier);

  $("m-swara-stack").setAttribute("aria-label", `${sw.desc}, ${formatSaptakLabel(tier)}`);
  $("m-fullname").textContent = sw.desc;
  $("m-meta").textContent = `${render.western} · ${render.freq.toFixed(1)} Hz`;
}

function renderIdle() {
  $("m-letter").textContent = "—";
  $("m-letter").className = "milap-swara-name swara-name";
  $("m-letter").style.color = "";
  $("m-saptak").textContent = "";
  $("m-fullname").textContent = "Sing a note";
  $("m-meta").textContent = "— Hz";
}

function resizeCanvas(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || 320;
  const h = rect.height || (canvas.id === "m-wave" ? 96 : 56);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

function buildWavePath(samples, startT, endT, liveTail = null) {
  let pts = samples
    .filter((s) => s.t >= startT && s.t <= endT)
    .map((s) => ({ t: s.t, cents: s.visualCents ?? s.cents }));
  if (liveTail && liveTail.t >= startT) {
    if (pts.length && liveTail.t - pts[pts.length - 1].t < WAVE_SAMPLE_SEC * 0.5) {
      pts[pts.length - 1] = { t: pts[pts.length - 1].t, cents: liveTail.cents };
    }
    if (!pts.length || liveTail.t - pts[pts.length - 1].t > 0.02) {
      pts.push({ t: liveTail.t, cents: liveTail.cents });
    } else {
      pts[pts.length - 1] = { t: liveTail.t, cents: liveTail.cents };
    }
  }
  if (pts.length < 2) {
    if (pts.length === 1) {
      const p = pts[0];
      return [
        { t: Math.max(startT, p.t - 0.15), cents: p.cents },
        p,
      ];
    }
    return pts;
  }
  return pts;
}

function clipWaveCents(cents) {
  return Math.max(-WAVE_Y_CENTS, Math.min(WAVE_Y_CENTS, cents));
}

function slewWaveCents(target) {
  if (!Number.isFinite(displayWaveCents)) return target;
  const delta = target - displayWaveCents;
  if (Math.abs(delta) <= WAVE_SLEW_CENTS) return target;
  return displayWaveCents + Math.sign(delta) * WAVE_SLEW_CENTS;
}

function pushWaveTrace(rawCents) {
  waveTraceActive = true;
  const clamped = clipWaveCents(rawCents);
  const blended = Number.isFinite(displayWaveCents)
    ? displayWaveCents * WAVE_TRACE_EMA + clamped * (1 - WAVE_TRACE_EMA)
    : clamped;
  if (Number.isFinite(displayWaveCents) && Math.abs(clamped - displayWaveCents) > 80) {
    displayWaveCents = clamped;
    return;
  }
  displayWaveCents = slewWaveCents(blended);
}

function appendWaveSample(elapsed, tol) {
  if (!waveTraceActive || !Number.isFinite(displayWaveCents)) return;
  if (lastWaveSampleT >= 0 && elapsed - lastWaveSampleT < WAVE_SAMPLE_SEC - 0.001) return;
  const last = sessionSamples[sessionSamples.length - 1];
  if (last && Math.abs(last.t - elapsed) < 0.02 && Math.abs((last.visualCents ?? last.cents) - displayWaveCents) < 0.5) {
    lastWaveSampleT = elapsed;
    return;
  }
  lastWaveSampleT = elapsed;
  recordWaveSample(elapsed, rawCentsForScoring(), tol);
}

function drawWave(ctx, canvas, samples, tol, timeWindow = WAVE_WINDOW_SEC, viewEndT = null, liveTail = null) {
  const { w, h } = resizeCanvas(canvas, ctx);
  ctx.clearRect(0, 0, w, h);
  const midY = h / 2;
  const scaleY = (h * 0.24) / WAVE_Y_CENTS;

  ctx.fillStyle = "rgba(155, 123, 255, 0.08)";
  ctx.fillRect(0, midY - tol * scaleY, w, tol * scaleY * 2);
  ctx.fillStyle = "rgba(95, 212, 199, 0.16)";
  ctx.fillRect(0, midY - WAVE_STEADY_CENTS * scaleY, w, WAVE_STEADY_CENTS * scaleY * 2);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  [-tol, tol].forEach((cents) => {
    const y = midY - cents * scaleY;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  });

  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = "rgba(95, 212, 199, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(w, midY);
  ctx.stroke();
  ctx.restore();

  if (samples.length < 2 && !liveTail) return;

  const endT = viewEndT ?? liveTail?.t ?? samples[samples.length - 1].t;
  const startT = Math.max(0, endT - timeWindow);
  const path = buildWavePath(samples, startT, endT, liveTail);
  if (path.length < 2) return;

  ctx.strokeStyle = centsColor(path[path.length - 1].cents, tol);
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  path.forEach((pt, i) => {
    const x = ((pt.t - startT) / timeWindow) * w;
    const y = midY - clipWaveCents(pt.cents) * scaleY;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function waveLiveTail(elapsed, now = performance.now()) {
  if (!sessionActive || !waveTraceActive || !Number.isFinite(displayWaveCents)) return null;
  if (now - lastDisplayVoiceAt > displayHoldMs()) return null;
  return { t: elapsed, cents: displayWaveCents };
}

function drawLiveWave(elapsed, tol, now = performance.now()) {
  const holdingVoice = now - lastDisplayVoiceAt <= displayHoldMs();
  const viewEndT = holdingVoice || lastWaveSampleT < 0 ? elapsed : lastWaveSampleT;
  const liveWindow = Math.max(WAVE_WINDOW_SEC, Math.ceil(viewEndT / WAVE_WINDOW_SEC) * WAVE_WINDOW_SEC);
  drawWave(waveCtx, waveCanvas, sessionSamples, tol, liveWindow, liveWindow, waveLiveTail(elapsed, now));
}

function rawCentsForScoring() {
  return scoringCents(lastRender);
}

function recordWaveSample(elapsed, cents, tol) {
  if (!Number.isFinite(cents)) return;
  const inTune = Math.abs(cents) <= tol && onTargetSwara(lastRender);
  // Store scoring cents, not the visually smoothed wave cents. The wave can be calm
  // while scoring still reflects the real sung pitch accuracy.
  sessionSamples.push({ t: elapsed, cents, visualCents: displayWaveCents, inTune });
}

function updateReferenceUi() {
  const button = $("m-reference");
  const description = $("m-reference-description");
  if (!button || !description) return;
  const available = targetMode === "swara";
  button.disabled = !available;
  description.textContent = available
    ? `${formatTargetLabel()} · ${midiName(saMidi + targetSwaraIdx + targetOctave * 12)}`
    : "Choose a target note above to hear a clear sustained guide.";
  $("m-reference-label").textContent = referenceNodes ? "Stop note" : "Play note";
  button.classList.toggle("playing", Boolean(referenceNodes));
}

async function startReferenceNote() {
  if (targetMode !== "swara") return;
  stopReferenceNote();
  if (tanpuraToggle?.checked) tanpuraToggle.checked = false;
  stopTanpura();

  const ctx = ensureContext();
  if (ctx.state === "suspended") await ctx.resume();
  const midi = saMidi + targetSwaraIdx + targetOctave * 12;
  const frequency = midiToFreq(midi);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.08);
  master.connect(ctx.destination);

  const harmonics = [
    { multiple: 1, level: 0.7, type: "sine" },
    { multiple: 2, level: 0.2, type: "sine" },
    { multiple: 3, level: 0.1, type: "triangle" },
  ];
  const oscillators = harmonics.map(({ multiple, level, type }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency * multiple;
    gain.gain.value = level;
    osc.connect(gain).connect(master);
    osc.start();
    return osc;
  });

  referenceNodes = { master, oscillators };
  $("m-status").textContent = `Reference note playing · ${formatTargetLabel()} · ${midiName(midi)}`;
  updateReferenceUi();
  updateAccompanimentUi();
}

function stopReferenceNote() {
  if (!referenceNodes || !audioCtx) return;
  const { master, oscillators } = referenceNodes;
  const now = audioCtx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
  oscillators.forEach((osc) => osc.stop(now + 0.06));
  referenceNodes = null;
  updateReferenceUi();
  updateAccompanimentUi();
}

function preferredRecordingMimeType() {
  if (!window.MediaRecorder) return "";
  return [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ].find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

function startSessionRecording() {
  if (!$("m-record-session")?.checked || !micStream || !window.MediaRecorder) return;
  sessionRecordingChunks = [];
  sessionRecordingStartedAt = performance.now();
  const mimeType = preferredRecordingMimeType();
  sessionRecorder = new MediaRecorder(micStream, mimeType ? { mimeType } : undefined);
  sessionRecorder.addEventListener("dataavailable", (event) => {
    if (event.data?.size) sessionRecordingChunks.push(event.data);
  });
  sessionRecorder.start(500);
  updateRecordingIndicator(true);
}

function updateRecordingIndicator(active) {
  const badge = $("m-recording-badge");
  if (!badge) return;
  badge.hidden = !active;
  milapView?.classList.toggle("is-recording", Boolean(active));
}

function stopSessionRecording({ save = true, durationSec = 0 } = {}) {
  const recorder = sessionRecorder;
  updateRecordingIndicator(false);
  if (!recorder) return Promise.resolve();
  sessionRecorder = null;
  return new Promise((resolve) => {
    recorder.addEventListener("stop", async () => {
      try {
        if (save && sessionRecordingChunks.length) {
          const blob = new Blob(sessionRecordingChunks, {
            type: recorder.mimeType || sessionRecordingChunks[0].type || "audio/webm",
          });
          await saveRecording({
            blob,
            title: `${formatTargetLabel()} practice`,
            durationSec: durationSec || (performance.now() - sessionRecordingStartedAt) / 1000,
            target: formatTargetLabel(),
            sa: midiName(saMidi),
          });
          $("m-status").textContent = "Session complete · recording saved on this device.";
          await renderRecordings();
        }
      } catch (_err) {
        $("m-status").textContent = "Session complete, but this device could not save the recording.";
      } finally {
        sessionRecordingChunks = [];
        resolve();
      }
    }, { once: true });
    if (recorder.state !== "inactive") recorder.stop();
    else resolve();
  });
}

function formatRecordingDate(iso) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

async function renderRecordings() {
  const container = $("m-recordings-list");
  if (!container) return;
  try {
    const records = await listRecordings();
    container.replaceChildren();
    if (!records.length) {
      const empty = document.createElement("div");
      empty.className = "recordings-empty";
      const title = document.createElement("strong");
      title.textContent = "No recordings yet";
      const copy = document.createElement("p");
      copy.textContent = "Turn on “Record this session”, then complete a practice session.";
      empty.append(title, copy);
      container.append(empty);
      return;
    }

    records.forEach((record) => {
      const item = document.createElement("article");
      item.className = "recording-item";
      const copy = document.createElement("div");
      copy.className = "recording-copy";
      const title = document.createElement("strong");
      title.textContent = record.target;
      const meta = document.createElement("span");
      meta.textContent = `${record.sa} · ${record.durationSec}s · ${formatRecordingDate(record.createdAt)}`;
      copy.append(title, meta);

      const audio = document.createElement("audio");
      const url = URL.createObjectURL(record.blob);
      audio.controls = true;
      audio.preload = "metadata";
      audio.src = url;
      audio.addEventListener("emptied", () => URL.revokeObjectURL(url), { once: true });

      const actions = document.createElement("div");
      actions.className = "recording-actions";
      const share = document.createElement("button");
      share.type = "button";
      share.textContent = "Share";
      share.addEventListener("click", async () => {
        share.disabled = true;
        try {
          const result = await shareRecording(record);
          $("m-status").textContent = result === "shared"
            ? "Recording shared."
            : "Recording downloaded. Share it from your Downloads or Files app.";
        } catch (err) {
          if (err?.name !== "AbortError") {
            $("m-status").textContent = "This recording could not be shared. Please try again.";
          }
        } finally {
          share.disabled = false;
        }
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", async () => {
        await deleteRecording(record.id);
        URL.revokeObjectURL(url);
        renderRecordings();
      });
      actions.append(share, remove);
      item.append(copy, audio, actions);
      container.append(item);
    });
  } catch (_err) {
    container.textContent = "Recordings are unavailable in this browser's current storage mode.";
  }
}

function initOnboarding() {
  const dialog = $("m-onboarding-dialog");
  if (!dialog) return;
  const steps = [
    {
      title: "Meet your daily sur companion",
      copy: "Set Your Pitch, sing a sustained note, and see your swara and steadiness in real time.",
      symbol: "सा",
    },
    {
      title: "Listen, then match",
      copy: "Choose a target swara and play its reference note whenever you need an auditory guide.",
      symbol: "♪",
    },
    {
      title: "Your voice stays yours",
      copy: "Pitch analysis happens on this device. Audio is saved only when you explicitly record a session.",
      symbol: "◌",
    },
  ];
  let index = 0;

  const render = () => {
    const step = steps[index];
    $("m-onboarding-step").textContent = `${index + 1} of ${steps.length}`;
    $("m-onboarding-title").textContent = step.title;
    $("m-onboarding-copy").textContent = step.copy;
    dialog.querySelector(".onboarding-symbol").textContent = step.symbol;
    dialog.querySelectorAll(".onboarding-dots span").forEach((dot, i) => dot.classList.toggle("active", i === index));
    $("m-onboarding-next").textContent = index === steps.length - 1 ? "Start practising" : "Continue";
  };
  const close = () => {
    localStorage.setItem("swarsaathi:onboarding:v1.2", "done");
    dialog.close();
  };
  const open = () => {
    index = 0;
    render();
    dialog.showModal();
  };

  $("m-onboarding-next").addEventListener("click", () => {
    if (index >= steps.length - 1) close();
    else {
      index += 1;
      render();
    }
  });
  $("m-onboarding-skip").addEventListener("click", close);
  $("m-onboarding-replay")?.addEventListener("click", () => {
    $("m-settings-dialog")?.close();
    open();
  });
  if (localStorage.getItem("swarsaathi:onboarding:v1.2") !== "done") open();
}

function ensureContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function micAudioConstraints() {
  if (isIosNativeShell()) {
    return { echoCancellation: false, noiseSuppression: false, autoGainControl: true };
  }
  return { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
}

async function ensureMicConsent() {
  if (localStorage.getItem(MIC_CONSENT_KEY) === "granted") return true;
  const dialog = $("m-mic-consent-dialog");
  if (!dialog?.showModal) {
    localStorage.setItem(MIC_CONSENT_KEY, "granted");
    return true;
  }
  return new Promise((resolve) => {
    const allow = $("m-mic-consent-allow");
    const cancel = $("m-mic-consent-cancel");
    const finish = (ok) => {
      allow?.removeEventListener("click", onAllow);
      cancel?.removeEventListener("click", onCancel);
      dialog.close();
      if (ok) localStorage.setItem(MIC_CONSENT_KEY, "granted");
      resolve(ok);
    };
    const onAllow = () => finish(true);
    const onCancel = () => finish(false);
    allow?.addEventListener("click", onAllow, { once: true });
    cancel?.addEventListener("click", onCancel, { once: true });
    dialog.showModal();
  });
}

async function connectMic() {
  const allowed = await ensureMicConsent();
  if (!allowed) {
    const err = new Error("Microphone consent declined");
    err.name = "ConsentDeclinedError";
    throw err;
  }
  ensureContext();
  if (audioCtx.state === "suspended") await audioCtx.resume();
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: micAudioConstraints(),
  });
  micSource = audioCtx.createMediaStreamSource(micStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 4096;
  buf = new Float32Array(analyser.fftSize);
  micSink = audioCtx.createGain();
  // Keep the iOS WKWebView graph active without audible mic feedback.
  micSink.gain.value = 0.00001;
  micSource.connect(analyser);
  // iOS WKWebView is more reliable when the analysis graph reaches destination.
  analyser.connect(micSink).connect(audioCtx.destination);
}

function disconnectMic() {
  try {
    micSource?.disconnect();
    analyser?.disconnect();
    micSink?.disconnect();
  } catch (_e) { /* already disconnected */ }
  micSource = null;
  micSink = null;
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  analyser = null;
}

async function startListening() {
  if (sessionActive) return;
  if (sessionPaused) {
    await resumeListening();
    return;
  }
  try {
    await connectMic();

    sessionActive = true;
    sessionPaused = false;
    sessionSamples = [];
    displayWaveCents = NaN;
    waveTraceActive = false;
    lastWaveSampleT = -1;
    sessionStart = performance.now();
    pausedElapsedSec = 0;
    resetPitchState();
    noiseFloor = ABS_MIN_RMS;
    settleUntil = performance.now() + SETTLE_MS;
    calibrated = false;
    lastVoiceAt = 0;
    lastDisplayVoiceAt = 0;
    lastMicHintAt = 0;
    startSessionRecording();

    $("m-summary").hidden = true;
    $("m-live").hidden = false;
    setDurationChipsLocked(true);
    $("m-mic").classList.add("running");
    $("m-mic-label").textContent = "Stop & review";
    $("m-live-bar").style.width = "0%";
    $("m-live").querySelector(".live-bar-wrap")?.classList.toggle("is-continuous", isContinuousSession());
    $("m-status").textContent = "Calibrating — stay quiet for a moment…";

    loop();
  } catch (err) {
    $("m-status").textContent = err?.name === "ConsentDeclinedError"
      ? "Microphone not enabled. Tap Start listening whenever you are ready."
      : err?.name === "NotAllowedError"
        ? "Microphone blocked. Allow mic access in your device or browser settings."
        : "Couldn't access the microphone on this device.";
  }
}

async function resumeListening() {
  if (sessionActive || !sessionPaused) return;
  if (sessionMode === "timed" && pausedElapsedSec >= sessionSec) {
    sessionPaused = false;
    finishSession();
    return;
  }
  try {
    await connectMic();
    startSessionRecording();
    sessionActive = true;
    sessionPaused = false;
    sessionStart = performance.now() - pausedElapsedSec * 1000;
    settleUntil = performance.now() + 80;
    calibrated = true;

    setDurationChipsLocked(true);
    $("m-mic").classList.add("running");
    $("m-mic-label").textContent = "Stop & review";
    $("m-status").textContent = isContinuousSession()
      ? "Resumed — tap Stop & review when done."
      : `Resumed · ${sessionSec}s drill — tap Stop & review when done.`;

    loop();
  } catch (err) {
    $("m-status").textContent = err?.name === "ConsentDeclinedError"
      ? "Microphone not enabled. Tap Start listening whenever you are ready."
      : err?.name === "NotAllowedError"
        ? "Microphone blocked. Allow mic access in your device or browser settings."
        : "Couldn't access the microphone on this device.";
  }
}

function pauseListening() {
  if (!sessionActive) return;
  pausedElapsedSec = (performance.now() - sessionStart) / 1000;
  warmCalibration = calibrated;
  lastListenStopAt = performance.now();
  sessionActive = false;
  sessionPaused = true;
  void stopSessionRecording({ save: false });
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  disconnectMic();
  setDurationChipsLocked(false);
  $("m-mic")?.classList.remove("running");
  $("m-live").querySelector(".live-bar-wrap")?.classList.remove("is-continuous");
  $("m-mic-label").textContent = "Start listening";
  $("m-live-stat").textContent = formatReadyStat();
  $("m-status").textContent = "Paused — tap Start to resume.";
  drawWave(
    waveCtx,
    waveCanvas,
    sessionSamples,
    getTolerance(),
    WAVE_WINDOW_SEC,
    pausedElapsedSec,
  );
}

function stopListening({ saveRecording: shouldSaveRecording = false } = {}) {
  const durationSec = sessionSamples.length
    ? sessionSamples[sessionSamples.length - 1].t
    : (sessionStart ? (performance.now() - sessionStart) / 1000 : 0);
  if (sessionRecorder) void stopSessionRecording({ save: shouldSaveRecording, durationSec });
  warmCalibration = calibrated;
  lastListenStopAt = performance.now();
  sessionActive = false;
  sessionPaused = false;
  pausedElapsedSec = 0;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  disconnectMic();
  setDurationChipsLocked(false);
  $("m-mic")?.classList.remove("running");
  $("m-live").querySelector(".live-bar-wrap")?.classList.remove("is-continuous");
  if ($("m-mic-label")) $("m-mic-label").textContent = "Start listening";
}

async function finishSession() {
  const durationSec = sessionSamples.length
    ? sessionSamples[sessionSamples.length - 1].t
    : (sessionStart ? (performance.now() - sessionStart) / 1000 : 0);
  const recording = stopSessionRecording({ save: true, durationSec });
  stopListening({ saveRecording: false });
  $("m-live").hidden = true;
  showSummary();
  await recording;
}

function loop() {
  rafId = requestAnimationFrame(loop);
  if (!analyser || !sessionActive) return;

  const elapsed = (performance.now() - sessionStart) / 1000;
  const tol = getTolerance();
  const gp = getGateParams();
  const now = performance.now();

  if (sessionMode === "timed" && elapsed >= sessionSec) {
    drawLiveWave(elapsed, tol, now);
    finishSession();
    return;
  }

  analyser.getFloatTimeDomainData(buf);
  const { freq, clarity, rms } = autoCorrelate(buf, audioCtx.sampleRate, {
    silenceRms: detectionSilenceRms(),
  });
  const resolvedFreq = applyVocalOctaveCorrection(freq, saMidi, lowerMicOctave);

  if (now < settleUntil) {
    if (rms < 0.025) noiseFloor = noiseFloor * 0.88 + rms * 0.12;
    renderIdle();
    drawLiveWave(elapsed, tol, now);
    $("m-live-stat").textContent = `Calibrating… ${Math.round(elapsed)}s`;
    return;
  }

  if (!calibrated) {
    calibrated = true;
    noiseFloor = Math.min(noiseFloor, 0.018);
    $("m-status").textContent = tanpuraToggle?.checked || metronomeToggle?.checked
      ? "Listening — use headphones with accompaniment."
      : "Listening… hold your note steady.";
  }

  const gate = voiceGate(gp);
  const minClarity = voiceMinClarity(gp);
  const hasPitch = resolvedFreq >= FMIN && resolvedFreq <= FMAX;
  const strongVoice = hasPitch && rms >= gate && clarity >= minClarity;
  const softVoice = hasPitch && rms >= gate * 0.62 && clarity >= minClarity * 0.82;
  const recoveringVoice = hasPitch && now - lastVoiceAt <= displayHoldMs() && rms >= gate * 0.42 && clarity >= minClarity * 0.72;
  const isVoice = strongVoice || softVoice || recoveringVoice;
  const hasDisplayEnergy = rms >= displayEnergyGate();
  const sustainedSound = lastRender
    && (hasPitch || hasDisplayEnergy)
    && now - lastDisplayVoiceAt <= staleDisplayMs();
  const recentlyDisplayedVoice = lastRender && now - lastDisplayVoiceAt <= displayHoldMs();

  if (!isVoice) {
    noiseFloor = noiseFloor * 0.96 + Math.min(rms, noiseFloor * 1.5) * 0.04;
    if (sustainedSound) {
      lastDisplayVoiceAt = now;
      paintReadout(lastRender);
    } else if (recentlyDisplayedVoice) {
      paintReadout(lastRender);
    } else {
      lastRender = stabilizer.process(resolvedFreq, { isVoice: false, now });
      if (!lastRender) renderIdle();
      else paintReadout(lastRender);
    }
    if (now - lastVoiceAt > 1200 && now - lastMicHintAt > 800) {
      if (rms < gate * 0.55) {
        $("m-status").textContent = "Listening — move closer to the mic or increase Sensitivity.";
      } else if (!hasPitch) {
        $("m-status").textContent = "Listening — hold one steady sung note.";
      } else {
        $("m-status").textContent = "Listening — sound detected, hold the note steady for a moment.";
      }
      lastMicHintAt = now;
    }
  } else {
    lastVoiceAt = now;
    lastDisplayVoiceAt = now;
    const stable = stabilizer.process(resolvedFreq, { isVoice: true, now });
    if (stable) {
      lastRender = stable;
      if (stable.saptakChanged) displayWaveCents = stable.cents;
      pushWaveTrace(scoringCents(stable));
      paintReadout(stable);
      appendWaveSample(elapsed, tol);
    } else if (lastRender) {
      paintReadout(lastRender);
      appendWaveSample(elapsed, tol);
    }
  }

  drawLiveWave(elapsed, tol, now);
  const voiced = sessionSamples.filter((s) => s.inTune);
  const inTunePct = sessionSamples.length
    ? Math.round((voiced.length / sessionSamples.length) * 100)
    : 0;
  updateLiveProgress(elapsed, inTunePct);
}

function computeMetrics() {
  const tol = getTolerance();
  if (!sessionSamples.length) return null;

  const settled = sessionSamples.filter((s) => s.t >= SCORE_ATTACK_IGNORE_SEC);
  const scoredSamples = settled.length >= 3 ? settled : sessionSamples;
  const inTune = scoredSamples.filter((s) => s.inTune);
  const accPct = Math.round((inTune.length / scoredSamples.length) * 100);
  const centsVals = scoredSamples.map((s) => s.cents).filter(Number.isFinite);
  const avg = centsVals.reduce((a, b) => a + b, 0) / centsVals.length;
  const sortedAbs = centsVals.map((c) => Math.abs(c - avg)).sort((a, b) => a - b);
  const p80 = sortedAbs[Math.min(sortedAbs.length - 1, Math.floor(sortedAbs.length * 0.8))] || 0;
  const sigma = Math.sqrt(centsVals.reduce((a, c) => a + (c - avg) ** 2, 0) / centsVals.length);
  const ref = LEVELS[strictness]?.stabilityRef ?? 16;
  const jitterScore = 100 - (p80 / ref) * 42;
  const sigmaScore = 100 - (sigma / (ref * 1.9)) * 28;
  const inTuneSupport = accPct * 0.18;
  const stbPct = Math.max(0, Math.min(100, Math.round(jitterScore * 0.58 + sigmaScore * 0.24 + inTuneSupport)));

  let bestHold = 0;
  let holdStart = null;
  sessionSamples.forEach((s) => {
    if (s.inTune) {
      if (holdStart == null) holdStart = s.t;
      bestHold = Math.max(bestHold, s.t - holdStart);
    } else holdStart = null;
  });

  return {
    accPct,
    stbPct,
    composite: Math.round(accPct * 0.62 + stbPct * 0.38),
    avg,
    stbSigma: sigma,
    jitterP80: p80,
    bestHold,
    lockPct: Math.round((scoredSamples.filter((s) => Math.abs(s.cents) < WAVE_Y_CENTS).length / scoredSamples.length) * 100),
  };
}

function buildHistogram(container, samples, tol) {
  container.innerHTML = "";
  const counts = Array(11).fill(0);
  samples.forEach((s) => {
    counts[Math.max(0, Math.min(10, Math.floor((s.cents + 50) / 10)))] += 1;
  });
  const max = Math.max(...counts, 1);
  counts.forEach((c, i) => {
    const bar = document.createElement("div");
    bar.className = "hist-bar";
    bar.style.height = `${(c / max) * 100}%`;
    bar.style.background = Math.abs(i * 10 - 50) <= tol
      ? "rgba(95,212,199,0.55)"
      : "rgba(155,123,255,0.35)";
    container.appendChild(bar);
  });
}

function showSummary() {
  const m = computeMetrics();
  if (!m) {
    resetPracticeReady();
    $("m-status").textContent = "No voice detected — try again in a quieter room.";
    return;
  }

  $("m-summary").hidden = false;
  const summarySec = isContinuousSession() ? sessionSummaryDuration() : sessionSec;
  $("m-summary-title").textContent = isContinuousSession()
    ? `Session complete · ${summarySec}s`
    : `Session complete · ${sessionSec}s`;
  $("m-summary-target").textContent = `Target: ${formatTargetLabel()} · ${midiName(getScoringMidi())}`;
  $("m-acc").textContent = `${m.accPct}%`;
  $("m-stb").textContent = `${m.stbPct}%`;
  $("m-composite").textContent = String(m.composite);
  $("m-acc-ring").setAttribute("stroke-dasharray", `${m.accPct}, 100`);
  $("m-stb-ring").setAttribute("stroke-dasharray", `${m.stbPct}, 100`);

  drawWave(summaryCtx, summaryCanvas, sessionSamples, getTolerance(), Math.max(summarySec, 4));
  buildHistogram($("m-hist"), sessionSamples, getTolerance());

  $("m-bias-needle").style.left = `${50 + Math.max(-45, Math.min(45, m.avg * 4))}%`;
  const avgR = Math.round(m.avg);
  $("m-avg-cents").textContent = `Avg ${avgR > 0 ? "+" : ""}${avgR}¢ · jitter ${m.jitterP80.toFixed(0)}¢`;

  $("m-stats").innerHTML = [
    `<li><strong>Best hold:</strong> ${m.bestHold.toFixed(1)}s in tune</li>`,
    `<li><strong>On-target lock:</strong> ${m.lockPct}% of session</li>`,
    `<li><strong>In-tune time:</strong> ${m.accPct}% within ±${getTolerance()}¢</li>`,
  ].join("");

  let tip = "Good balance of accuracy and stability. Repeat the drill to build muscle memory.";
  if (m.avg > 8) tip = "You tend to sing slightly sharp — relax the jaw and reduce throat tension.";
  else if (m.avg < -8) tip = "You tend to sing flat — engage core support and brighten the tone slightly.";
  else if (m.stbPct < 55) tip = "Stability is the focus — hold one note longer before changing pitch.";
  $("m-tip").textContent = tip;
  $("m-status").textContent = "Session complete — practice again or try a longer drill.";
}

function startDrone() {
  // Legacy synthetic drone kept only for backward compatibility if an old control exists.
  startTanpura();
}

function stopDrone() {
  stopTanpura();
}

function tanpuraSrc() {
  const mode = tanpuraMode();
  const file = tanpuraFileFor(saMidi, mode);
  if (!file) return null;
  const base = window.SWARSAATHI_AUDIO_BASE_URL || TANPURA_BASE_URL;
  return `${base.replace(/\/$/, "")}/tanpura/${encodeURIComponent(mode)}/${encodeURIComponent(file)}`;
}

function tanpuraSources() {
  const remote = tanpuraSrc();
  if (!remote) return [];
  const file = tanpuraFileFor(saMidi, tanpuraMode());
  const optimizedFile = file.replace(/\.mp3$/i, ".m4a");
  const local = `${TANPURA_LOCAL_BASE_URL}/${encodeURIComponent(tanpuraMode())}/${encodeURIComponent(optimizedFile)}`;
  const hasLocal = TANPURA_LOCAL.has(`${tanpuraMode()}/${saMidi}`) || TANPURA_LOCAL.size === 0;
  return hasLocal ? [local, remote] : [remote, local];
}

async function startTanpura() {
  stopReferenceNote();
  stopTanpura();
  ensureContext();
  if (audioCtx.state === "suspended") await audioCtx.resume();
  const sources = tanpuraSources();
  if (!sources.length) {
    if (tanpuraToggle) tanpuraToggle.checked = false;
    $("m-status").textContent = `${midiName(saMidi)} is not available for ${tanpuraMode()} tanpura yet.`;
    updatePitchAvailability();
    updateAccompanimentUi();
    return;
  }
  tanpuraAudio = new Audio();
  tanpuraAudio.loop = true;
  tanpuraAudio.preload = "auto";
  tanpuraAudio.volume = 0.42;
  tanpuraAudio.addEventListener("playing", () => {
    if (tanpuraToggle) tanpuraToggle.checked = true;
    $("m-status").textContent = "Tanpura on — use headphones if it affects mic detection.";
    updatePitchAvailability();
    updateAccompanimentUi();
  }, { once: true });
  let lastError = null;
  for (const src of sources) {
    try {
      tanpuraAudio.src = src;
      await tanpuraAudio.play();
      return;
    } catch (err) {
      lastError = err;
    }
  }
  if (tanpuraToggle) tanpuraToggle.checked = false;
  updatePitchAvailability();
  updateAccompanimentUi();
  $("m-status").textContent = lastError?.name === "NotAllowedError"
    ? "Tap Tanpura again after audio permission is allowed."
    : `Tanpura could not start for ${midiName(saMidi)}. Check your connection.`;
}

function stopTanpura() {
  if (!tanpuraAudio) return;
  tanpuraAudio.pause();
  tanpuraAudio.src = "";
  tanpuraAudio = null;
  updateAccompanimentUi();
}

function metronomeBpm() {
  return Math.max(40, Math.min(180, parseInt(bpmInput?.value || "80", 10)));
}

function playMetronomeClick(accented) {
  const ctx = ensureContext();
  if (ctx.state === "suspended") ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = accented ? 1320 : 880;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(accented ? 0.22 : 0.12, ctx.currentTime + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (accented ? 0.09 : 0.055));
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.11);
}

function metronomeTick() {
  const taal = TAALS[taalSelect?.value || "teentaal"] || TAALS.teentaal;
  const beat = metronomeBeat % taal.beats;
  playMetronomeClick(beat === 0 || taal.accent.includes(beat));
  metronomeBeat = (metronomeBeat + 1) % taal.beats;
  metronomeTimer = window.setTimeout(metronomeTick, 60000 / metronomeBpm());
}

function startMetronome() {
  stopMetronome();
  ensureContext();
  metronomeBeat = 0;
  metronomeTick();
}

function stopMetronome() {
  if (metronomeTimer) window.clearTimeout(metronomeTimer);
  metronomeTimer = null;
  metronomeBeat = 0;
  updateAccompanimentUi();
}


function updateAccompanimentUi() {
  const tanpuraOn = Boolean(tanpuraToggle?.checked && tanpuraAudio);
  const metroOn = Boolean(metronomeToggle?.checked && metronomeTimer);
  const referenceOn = Boolean(referenceNodes);
  const active = tanpuraOn || metroOn || referenceOn;
  if (accompSummary) {
    const parts = [];
    if (tanpuraOn) parts.push(`Tanpura ${tanpuraMode()} · ${midiName(saMidi)}`);
    if (metroOn) parts.push(`${TAALS[taalSelect?.value || "teentaal"].label} · ${metronomeBpm()} BPM`);
    if (referenceOn) parts.push(`Reference · ${formatTargetLabel()}`);
    accompSummary.textContent = parts.join(" · ") || "Accompaniment";
  }
  if (accompBar) {
    const isAccompMode = milapView?.classList.contains("accomp-mode");
    accompBar.hidden = !active || isAccompMode;
  }
}

function bindEvents() {
  $("m-sa").addEventListener("change", (e) => {
    stopReferenceNote();
    saMidi = parseInt(e.target.value, 10);
    stabilizer?.setSaMidi(saMidi);
    resetPitchState();
    updatePitchAvailability();
    if (tanpuraToggle?.checked || droneNodes) startTanpura();
    updateAccompanimentUi();
    savePracticePrefs();
  });

  $("m-target-trigger").addEventListener("click", (e) => {
    e.stopPropagation();
    if ($("m-target-sheet").hidden) openTargetSheet();
    else closeTargetSheet();
  });

  document.querySelector(".target-any").addEventListener("click", () => selectTarget("any"));

  document.addEventListener("click", (e) => {
    if (!$("m-target-sheet").hidden && !e.target.closest(".target-field")) closeTargetSheet();
  });

  $("m-duration").querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (sessionActive) return;
      if (sessionPaused) resetPracticeReady();
      $("m-duration").querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      sessionMode = chip.dataset.mode === "free" ? "free" : "timed";
      sessionSec = sessionMode === "free" ? 0 : parseInt(chip.dataset.sec, 10);
      $("m-live-stat").textContent = formatReadyStat();
      savePracticePrefs();
    });
  });

  $("m-strict").addEventListener("change", (e) => {
    strictness = e.target.value;
    savePracticePrefs();
  });

  $("m-sensitivity").addEventListener("input", (e) => {
    sensitivity = parseInt(e.target.value, 10);
    savePracticePrefs();
  });

  $("m-record-session")?.addEventListener("change", () => savePracticePrefs());

  $("m-mic").addEventListener("click", () => {
    if (sessionActive) {
      finishSession();
      return;
    }
    startListening();
  });

  $("m-again").addEventListener("click", () => {
    resetPracticeReady();
  });

  $("m-longer").addEventListener("click", () => {
    sessionMode = "timed";
    sessionSec = 10;
    $("m-duration").querySelectorAll(".chip").forEach((c) => {
      c.classList.toggle("active", c.dataset.sec === "10");
    });
    $("m-live-stat").textContent = formatReadyStat();
    $("m-summary").hidden = true;
    startListening();
  });

  $("m-settings")?.addEventListener("click", () => $("m-settings-dialog").showModal());
  $("m-mobile-more")?.addEventListener("click", () => $("m-settings-dialog").showModal());
  $("m-reference")?.addEventListener("click", () => {
    if (referenceNodes) stopReferenceNote();
    else startReferenceNote();
  });
  $("m-recordings-refresh")?.addEventListener("click", renderRecordings);

  droneToggle?.addEventListener("change", () => {
    if (droneToggle.checked) startTanpura();
    else stopTanpura();
  });

  tanpuraToggle?.addEventListener("change", () => {
    updatePitchAvailability();
    if (tanpuraToggle.checked) {
      ensureSupportedTanpuraPitch({ announce: true });
      updatePitchAvailability();
      startTanpura();
    } else {
      stopTanpura();
      updatePitchAvailability();
    }
  });

  tanpuraModeSelect?.addEventListener("change", () => {
    updatePitchAvailability();
    ensureSupportedTanpuraPitch({ announce: true });
    updatePitchAvailability();
    if (tanpuraToggle?.checked) startTanpura();
    updateAccompanimentUi();
    savePracticePrefs();
  });

  metronomeToggle?.addEventListener("change", () => {
    if (metronomeToggle.checked) startMetronome();
    else stopMetronome();
    updateAccompanimentUi();
  });

  taalSelect?.addEventListener("change", () => {
    if (metronomeToggle?.checked) startMetronome();
  });

  bpmInput?.addEventListener("input", (e) => {
    bpmValue.textContent = e.target.value;
    updateAccompanimentUi();
  });

  document.querySelectorAll("[data-m-panel]").forEach((btn) => {
    btn.addEventListener("click", () => setMilapPanel(btn.dataset.mPanel));
  });
  $("m-accomp-open")?.addEventListener("click", () => setMilapPanel("accomp"));
  $("m-accomp-stop")?.addEventListener("click", () => {
    if (tanpuraToggle) tanpuraToggle.checked = false;
    if (metronomeToggle) metronomeToggle.checked = false;
    stopTanpura();
    stopMetronome();
    updatePitchAvailability();
    updateAccompanimentUi();
  });
  setMilapPanel("practice");

  tablaToggle?.addEventListener("change", () => {
    tablaToggle.checked = false;
  });

  octaveToggle?.addEventListener("change", (e) => {
    lowerMicOctave = e.target.checked;
    resetPitchState();
  });

  window.addEventListener("resize", () => {
    drawWave(waveCtx, waveCanvas, sessionSamples, getTolerance());
    if (!$("m-summary").hidden) {
      const summarySec = isContinuousSession() ? sessionSummaryDuration() : sessionSec;
      drawWave(summaryCtx, summaryCanvas, sessionSamples, getTolerance(), Math.max(summarySec, 4));
    }
  });
}
