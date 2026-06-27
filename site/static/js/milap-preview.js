// SwarPractice mobile UI preview — simulated session (no mic). Layout approval only.

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SA_MIDI_MIN = 43;
const SA_MIDI_MAX = 62;
const SA_MIDI_DEFAULT = 48;

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
const TOLERANCE = { beginner: 35, intermediate: 20, expert: 10 };

// Wave: slow, steady scroll — easier on the eyes
const WAVE_WINDOW_SEC = 16;
const SAMPLE_INTERVAL_MS = 300;
const CENTS_EMA = 0.97;

const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const midiName = (m) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

const $ = (id) => document.getElementById(id);

let saMidi = SA_MIDI_DEFAULT;
let targetMode = "any";
let targetSwaraIdx = 3;
let targetOctave = 0;

// Live display follows detected voice (independent of target)
let detectedSwaraIdx = 3;
let detectedOctave = 0;

let sessionSec = 5;
let running = false;
let rafId = null;
let sessionSamples = [];
let sessionStart = 0;
let lastSampleAt = 0;
let smoothWaveCents = 0;

const waveCanvas = $("m-wave");
const waveCtx = waveCanvas.getContext("2d");
const summaryCanvas = $("m-summary-wave");
const summaryCtx = summaryCanvas.getContext("2d");

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
}

function swaraMarkHtml(sw) {
  return `<span class="swara-mark ${sw.variant}">${sw.letter}</span>`;
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
      btn.innerHTML = swaraMarkHtml(sw);
      btn.title = `${sw.desc} · ${OCTAVE_LABELS[String(oct)]}`;
      btn.addEventListener("click", () => selectTarget(sw.idx, oct));
      row.appendChild(btn);
    });
    grid.appendChild(row);
  });
}

function formatTargetLabel() {
  if (targetMode === "any") return "Any (free practice)";
  const sw = SWARAS[targetSwaraIdx];
  return `${sw.desc} · ${OCTAVE_LABELS[String(targetOctave)]}`;
}

function updateTargetUi() {
  $("m-target-label").textContent = formatTargetLabel();
  document.querySelectorAll(".target-cell").forEach((cell) => {
    const on = targetMode === "swara"
      && parseInt(cell.dataset.swara, 10) === targetSwaraIdx
      && parseInt(cell.dataset.octave, 10) === targetOctave;
    cell.classList.toggle("active", on);
  });
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
  if (swaraIdx === "any") {
    targetMode = "any";
  } else {
    targetMode = "swara";
    targetSwaraIdx = swaraIdx;
    targetOctave = octave;
  }
  updateTargetUi();
  closeTargetSheet();
}

function getTolerance() {
  return TOLERANCE[$("m-strict").value] || 20;
}

function getScoringMidi() {
  if (targetMode === "any") {
    return saMidi + detectedSwaraIdx + detectedOctave * 12;
  }
  return saMidi + targetSwaraIdx + targetOctave * 12;
}

function getDetectedMidi() {
  return saMidi + detectedSwaraIdx + detectedOctave * 12;
}

function paintReadout(cents = 0, color = null) {
  const sw = SWARAS[detectedSwaraIdx];
  const tol = getTolerance();
  const c = color || centsColor(cents, tol);
  const letterEl = $("m-letter");
  letterEl.textContent = sw.letter;
  letterEl.className = `swara-name swara-mark ${sw.variant}`;
  letterEl.style.color = c;

  const oct = detectedOctave;
  $("m-dots-above").textContent = oct > 0 ? "•" : "";
  $("m-dots-below").textContent = oct < 0 ? "•" : "";

  const octLabel = OCTAVE_LABELS[String(oct)] || "madhya";
  $("m-swara-stack").setAttribute("aria-label", `${sw.desc}, ${octLabel} saptak`);
  $("m-fullname").textContent = sw.desc;
  const midi = getDetectedMidi();
  $("m-meta").textContent = `${midiName(midi)} · ${midiToFreq(midi).toFixed(1)} Hz`;
}

function centsColor(cents, tol) {
  const ratio = Math.min(1, Math.max(0, (Math.abs(cents) - tol) / (tol * 2)));
  const hue = 130 - ratio * 130;
  return `hsl(${hue}, 80%, 58%)`;
}

function resizeCanvas(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || 320;
  const h = rect.height || (canvas.id === "m-wave" ? 120 : 72);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

function drawWave(ctx, canvas, samples, tol, timeWindow = WAVE_WINDOW_SEC, viewEndT = null) {
  const { w, h } = resizeCanvas(canvas, ctx);
  ctx.clearRect(0, 0, w, h);

  const midY = h / 2;
  const scaleY = (h * 0.32) / 50;

  ctx.fillStyle = "rgba(95, 212, 199, 0.1)";
  ctx.fillRect(0, midY - tol * scaleY, w, tol * scaleY * 2);

  // Reference: 100% accurate & stable = 0 cents (ideal hold)
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = "rgba(95, 212, 199, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(w, midY);
  ctx.stroke();
  ctx.restore();

  if (!samples.length) return;

  const endT = viewEndT ?? samples[samples.length - 1].t;
  const startT = Math.max(0, endT - timeWindow);
  const visible = samples.filter((s) => s.t >= startT);
  if (visible.length < 2) return;

  const lastC = visible[visible.length - 1].cents;
  ctx.strokeStyle = centsColor(lastC, tol);
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  visible.forEach((pt, i) => {
    const x = ((pt.t - startT) / timeWindow) * w;
    const y = midY - pt.cents * scaleY;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function simulateCents(t) {
  const settle = Math.min(1, t / 2.5);
  const bias = 4.5 * settle;
  const slow = Math.sin(t * 0.4) * 1.0;
  return bias + slow;
}

function runSessionLoop() {
  const elapsed = (performance.now() - sessionStart) / 1000;
  const duration = sessionSec;
  const tol = getTolerance();

  if (elapsed >= duration) {
    finishSession();
    return;
  }

  const now = performance.now();
  if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
    lastSampleAt = now;
    const raw = simulateCents(elapsed);
    smoothWaveCents = smoothWaveCents * CENTS_EMA + raw * (1 - CENTS_EMA);
    sessionSamples.push({
      t: elapsed,
      cents: smoothWaveCents,
      inTune: Math.abs(smoothWaveCents) <= tol,
    });
    paintReadout(smoothWaveCents);
  }

  drawWave(waveCtx, waveCanvas, sessionSamples, tol, WAVE_WINDOW_SEC, elapsed);

  const inTunePct = sessionSamples.filter((s) => s.inTune).length / (sessionSamples.length || 1);
  $("m-live-bar").style.width = `${(elapsed / duration) * 100}%`;
  $("m-live-stat").textContent = `${Math.round(elapsed)}s · ${Math.round(inTunePct * 100)}% in tune`;

  rafId = requestAnimationFrame(runSessionLoop);
}

function startSession() {
  if (running) return;
  running = true;
  sessionSamples = [];
  smoothWaveCents = 0;
  lastSampleAt = 0;
  sessionStart = performance.now();
  $("m-summary").hidden = true;
  $("m-live").hidden = false;
  $("m-hint").hidden = true;
  $("m-mic").classList.add("running");
  $("m-mic-label").textContent = "Listening…";
  $("m-live-bar").style.width = "0%";
  rafId = requestAnimationFrame(runSessionLoop);
}

function finishSession() {
  running = false;
  cancelAnimationFrame(rafId);
  $("m-mic").classList.remove("running");
  $("m-mic-label").textContent = "Start listening";
  $("m-live").hidden = true;
  showSummary();
}

function computeMetrics() {
  const tol = getTolerance();
  const voiced = sessionSamples;
  if (!voiced.length) return null;

  const inTune = voiced.filter((s) => s.inTune);
  const accPct = Math.round((inTune.length / voiced.length) * 100);
  const centsVals = voiced.map((s) => s.cents);
  const avg = centsVals.reduce((a, b) => a + b, 0) / centsVals.length;
  const variance = centsVals.reduce((a, c) => a + (c - avg) ** 2, 0) / centsVals.length;
  const sigma = Math.sqrt(variance);

  const inTuneCents = inTune.map((s) => s.cents);
  const stbSigma = inTuneCents.length > 1
    ? Math.sqrt(inTuneCents.reduce((a, c) => a + (c - avg) ** 2, 0) / inTuneCents.length)
    : sigma;
  const stbPct = Math.max(0, Math.min(100, Math.round(100 - stbSigma * 4)));

  let bestHold = 0;
  let holdStart = null;
  voiced.forEach((s) => {
    if (s.inTune) {
      if (holdStart == null) holdStart = s.t;
      bestHold = Math.max(bestHold, s.t - holdStart);
    } else holdStart = null;
  });

  const composite = Math.round(accPct * 0.6 + stbPct * 0.4);

  return {
    accPct, stbPct, composite, avg, sigma, stbSigma, bestHold,
    lockPct: Math.round((voiced.filter((s) => Math.abs(s.cents) < 50).length / voiced.length) * 100),
  };
}

function buildHistogram(container, samples, tol) {
  container.innerHTML = "";
  const bins = 11;
  const counts = Array(bins).fill(0);
  samples.forEach((s) => {
    const b = Math.max(0, Math.min(bins - 1, Math.floor((s.cents + 50) / 10)));
    counts[b] += 1;
  });
  const max = Math.max(...counts, 1);
  counts.forEach((c, i) => {
    const bar = document.createElement("div");
    bar.className = "hist-bar";
    bar.style.height = `${(c / max) * 100}%`;
    const center = Math.abs(i * 10 - 50);
    bar.style.background = center <= tol ? "rgba(95,212,199,0.55)" : "rgba(155,123,255,0.35)";
    container.appendChild(bar);
  });
}

function setRing(el, pct) {
  el.setAttribute("stroke-dasharray", `${pct}, 100`);
}

function showSummary() {
  const m = computeMetrics();
  if (!m) return;

  const targetLabel = formatTargetLabel();

  $("m-summary").hidden = false;
  $("m-summary-title").textContent = `Session complete · ${sessionSec}s`;
  $("m-summary-target").textContent = `Target: ${targetLabel} · ${midiName(getScoringMidi())}`;

  $("m-acc").textContent = `${m.accPct}%`;
  $("m-stb").textContent = `${m.stbPct}%`;
  $("m-composite").textContent = String(m.composite);
  setRing($("m-acc-ring"), m.accPct);
  setRing($("m-stb-ring"), m.stbPct);

  drawWave(summaryCtx, summaryCanvas, sessionSamples, getTolerance(), sessionSec);

  buildHistogram($("m-hist"), sessionSamples, getTolerance());

  const biasPos = 50 + Math.max(-45, Math.min(45, m.avg * 4));
  $("m-bias-needle").style.left = `${biasPos}%`;
  const avgR = Math.round(m.avg);
  $("m-avg-cents").textContent = `Avg ${avgR > 0 ? "+" : ""}${avgR}¢ · σ ${m.stbSigma.toFixed(0)}¢`;

  $("m-stats").innerHTML = [
    `<li><strong>Best hold:</strong> ${m.bestHold.toFixed(1)}s in tune</li>`,
    `<li><strong>On-target lock:</strong> ${m.lockPct}% of session</li>`,
    `<li><strong>In-tune time:</strong> ${m.accPct}% within ±${getTolerance()}¢</li>`,
  ].join("");

  let tip = "";
  if (m.avg > 8) tip = "You tend to sing slightly sharp — relax the jaw and reduce throat tension.";
  else if (m.avg < -8) tip = "You tend to sing flat — engage core support and brighten the tone slightly.";
  else if (m.stbPct < 55) tip = "Stability is the focus — hold one note longer before changing pitch.";
  else tip = "Good balance of accuracy and stability. Repeat the drill to build muscle memory.";
  $("m-tip").textContent = tip;

  paintReadout(m.avg, centsColor(m.avg, getTolerance()));
}

function bindEvents() {
  $("m-sa").addEventListener("change", (e) => {
    saMidi = parseInt(e.target.value, 10);
    paintReadout();
  });

  $("m-target-trigger").addEventListener("click", (e) => {
    e.stopPropagation();
    const open = $("m-target-sheet").hidden;
    if (open) openTargetSheet();
    else closeTargetSheet();
  });

  document.querySelector(".target-any").addEventListener("click", () => selectTarget("any"));

  document.addEventListener("click", (e) => {
    if (!$("m-target-sheet").hidden && !e.target.closest(".target-field")) {
      closeTargetSheet();
    }
  });

  $("m-duration").querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $("m-duration").querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      sessionSec = parseInt(chip.dataset.sec, 10);
      $("m-live-stat").textContent = `Ready · ${sessionSec} second drill`;
    });
  });

  $("m-mic").addEventListener("click", () => {
    if (running) return;
    startSession();
  });

  $("m-again").addEventListener("click", () => {
    $("m-summary").hidden = true;
    $("m-live").hidden = false;
    $("m-hint").hidden = false;
    sessionSamples = [];
    drawWave(waveCtx, waveCanvas, [], getTolerance());
    paintReadout();
  });

  $("m-longer").addEventListener("click", () => {
    sessionSec = 10;
    $("m-duration").querySelectorAll(".chip").forEach((c) => {
      c.classList.toggle("active", c.dataset.sec === "10");
    });
    $("m-summary").hidden = true;
    startSession();
  });

  $("m-settings").addEventListener("click", () => $("m-settings-dialog").showModal());
  $("m-strict").addEventListener("change", () => paintReadout());

  window.addEventListener("resize", () => {
    drawWave(waveCtx, waveCanvas, sessionSamples, getTolerance());
    if (!$("m-summary").hidden) {
      drawWave(summaryCtx, summaryCanvas, sessionSamples, getTolerance(), sessionSec);
    }
  });
}

function init() {
  buildSaOptions();
  buildTargetGrid();
  targetMode = "swara";
  targetSwaraIdx = 3;
  targetOctave = 0;
  detectedSwaraIdx = 3;
  detectedOctave = 0;
  updateTargetUi();
  bindEvents();
  paintReadout(0);
  drawWave(waveCtx, waveCanvas, [], getTolerance());
}

init();
