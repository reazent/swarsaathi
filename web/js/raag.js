// Raag Practice — tanpura + tabla with matra display (Teental v1).
// All client-side Web Audio; loops until stopped.

import { $ } from "./shared.js";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SA_MIDI_MIN = 43;
const SA_MIDI_MAX = 62;
const SA_MIDI_DEFAULT = 48;

const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const midiName = (m) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

// Teental — 16 matras, 4 vibhags. Sam: X · 2 · 0 (khali) · 3
const TEENTAL = {
  name: "Teental",
  matras: 16,
  sequence: [
    { bol: "Dha", sam: "X", kind: "taali" },
    { bol: "Dhin", sam: null, kind: null },
    { bol: "Dhin", sam: null, kind: null },
    { bol: "Dha", sam: null, kind: null },
    { bol: "Dha", sam: "2", kind: "taali" },
    { bol: "Dhin", sam: null, kind: null },
    { bol: "Dhin", sam: null, kind: null },
    { bol: "Dha", sam: null, kind: null },
    { bol: "Dha", sam: "0", kind: "khali" },
    { bol: "Tin", sam: null, kind: null },
    { bol: "Tin", sam: null, kind: null },
    { bol: "Ta", sam: null, kind: null },
    { bol: "Ta", sam: "3", kind: "taali" },
    { bol: "Dhin", sam: null, kind: null },
    { bol: "Dhin", sam: null, kind: null },
    { bol: "Dha", sam: null, kind: null },
  ],
};

// Recorded tabla hits (msarkar / Freesound — see web/audio/tabla/ATTRIBUTION.md)
const BOL_SAMPLES = {
  Dha: "/static/audio/tabla/dha.mp3",
  Dhin: "/static/audio/tabla/dhin.mp3",
  Tin: "/static/audio/tabla/tin.mp3",
  Ta: "/static/audio/tabla/ta.mp3",
};

let saSelect, bpmInput, bpmVal, tanpuraToggle, tablaToggle, playBtn, playLabel;
let statusEl, matraGrid, matraCells = [];
let saMidi = SA_MIDI_DEFAULT;
let bpm = 60;
let playing = false;
let audioCtx = null;
let tanpuraNodes = null;
let tablaGain = null;
let schedulerId = null;
let nextBeatTime = 0;
let currentMatra = 0;
let inited = false;
let sampleBuffers = {};
let samplesReady = false;
let samplesLoading = null;

export function init() {
  if (inited) return;
  inited = true;

  saSelect = $("g-sa");
  bpmInput = $("g-bpm");
  bpmVal = $("g-bpm-val");
  tanpuraToggle = $("g-tanpura");
  tablaToggle = $("g-tabla");
  playBtn = $("g-play");
  playLabel = $("g-play-label");
  statusEl = $("g-status");
  matraGrid = $("g-matra-grid");

  buildSaOptions();
  buildMatraGrid();

  bpmInput.addEventListener("input", () => {
    bpm = parseInt(bpmInput.value, 10);
    bpmVal.textContent = String(bpm);
  });

  saSelect.addEventListener("change", () => {
    saMidi = parseInt(saSelect.value, 10);
    if (playing && tanpuraToggle.checked) restartTanpura();
  });

  playBtn.addEventListener("click", () => {
    if (playing) stop();
    else start();
  });

  loadSamples().catch(() => {});
}

export function suspend() {
  stop();
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

function buildMatraGrid() {
  matraGrid.innerHTML = "";
  matraCells = [];
  TEENTAL.sequence.forEach((m, i) => {
    if (i > 0 && i % 4 === 0) {
      const sep = document.createElement("span");
      sep.className = "matra-vibhag";
      sep.setAttribute("aria-hidden", "true");
      matraGrid.appendChild(sep);
    }
    const cell = document.createElement("div");
    cell.className = "matra-cell";
    cell.dataset.idx = String(i);

    if (m.sam) {
      const sam = document.createElement("span");
      sam.className = `matra-sam ${m.kind || ""}`;
      sam.textContent = m.kind === "khali" ? "khali · 0" : m.sam;
      sam.title = m.kind === "khali" ? "Khali — wave on this beat" : `Taali — clap (${m.sam === "X" ? "Sam" : m.sam})`;
      cell.appendChild(sam);
    }

    const bol = document.createElement("span");
    bol.className = "matra-bol";
    bol.textContent = m.bol;
    cell.appendChild(bol);

    const num = document.createElement("span");
    num.className = "matra-num";
    num.textContent = String(i + 1);
    cell.appendChild(num);

    matraGrid.appendChild(cell);
    matraCells.push(cell);
  });
}

function ensureContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  if (!tablaGain) {
    tablaGain = audioCtx.createGain();
    tablaGain.gain.value = 0.92;
    tablaGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

async function loadSamples() {
  if (samplesReady) return;
  if (samplesLoading) return samplesLoading;
  samplesLoading = (async () => {
    ensureContext();
    await Promise.all(
      Object.entries(BOL_SAMPLES).map(async ([bol, url]) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load ${bol}`);
        sampleBuffers[bol] = await audioCtx.decodeAudioData(await res.arrayBuffer());
      }),
    );
    samplesReady = true;
  })();
  return samplesLoading;
}

async function start() {
  ensureContext();
  if (!samplesReady) {
    if (statusEl) statusEl.textContent = "Loading tabla samples…";
    try {
      await loadSamples();
    } catch (err) {
      console.error(err);
      if (statusEl) statusEl.textContent = "Couldn't load tabla samples — refresh and try again.";
      return;
    }
  }
  playing = true;
  playBtn.classList.add("on");
  playLabel.textContent = "Stop";
  statusEl.textContent = `${TEENTAL.name} · ${bpm} BPM — looping`;

  if (tanpuraToggle.checked) startTanpura();
  currentMatra = 0;
  nextBeatTime = audioCtx.currentTime + 0.08;
  schedulerId = setInterval(scheduleBeats, 25);
}

function stop() {
  playing = false;
  if (schedulerId) clearInterval(schedulerId);
  schedulerId = null;
  stopTanpura();
  clearHighlight();
  if (playBtn) {
    playBtn.classList.remove("on");
    playLabel.textContent = "Start practice";
  }
  if (statusEl) statusEl.textContent = "Set pitch and tempo, then start — matras loop until you stop.";
}

function restartTanpura() {
  stopTanpura();
  startTanpura();
}

function startTanpura() {
  stopTanpura();
  const ctx = ensureContext();
  const sa = midiToFreq(saMidi);
  const pa = sa * 2 ** (7 / 12);
  const master = ctx.createGain();
  master.gain.value = 0.0;
  master.connect(ctx.destination);
  master.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.5);

  const strings = [
    { f: sa / 2, g: 0.22 },
    { f: sa / 2, g: 0.18 },
    { f: sa, g: 0.32 },
    { f: pa, g: 0.18 },
  ];

  const oscs = strings.map(({ f, g }) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 720;
    lp.Q.value = 0.7;
    const gn = ctx.createGain();
    gn.gain.value = g;
    osc.connect(lp).connect(gn).connect(master);
    osc.start();
    return osc;
  });

  // Slow jawari shimmer on the main Sa string.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.22;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.04;
  lfo.connect(lfoG).connect(master.gain);
  lfo.start();

  tanpuraNodes = { master, oscs, lfo };
}

function stopTanpura() {
  if (!tanpuraNodes || !audioCtx) return;
  const { master, oscs, lfo } = tanpuraNodes;
  try {
    master.gain.cancelScheduledValues(audioCtx.currentTime);
    master.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.25);
    oscs.forEach((o) => o.stop(audioCtx.currentTime + 0.3));
    lfo.stop(audioCtx.currentTime + 0.3);
  } catch (_e) {
    /* already stopped */
  }
  tanpuraNodes = null;
}

function scheduleBeats() {
  if (!playing || !audioCtx) return;
  const secPerBeat = 60 / bpm;
  const horizon = 0.12;

  while (nextBeatTime < audioCtx.currentTime + horizon) {
    if (tablaToggle.checked) {
      const bol = TEENTAL.sequence[currentMatra].bol;
      playBol(bol, nextBeatTime);
    }
    const idx = currentMatra;
    const t = nextBeatTime;
    setTimeout(() => {
      if (playing) highlightMatra(idx);
    }, Math.max(0, (t - audioCtx.currentTime) * 1000));

    nextBeatTime += secPerBeat;
    currentMatra = (currentMatra + 1) % TEENTAL.matras;
  }
}

function playBol(bol, time) {
  const buf = sampleBuffers[bol];
  if (!buf || !audioCtx || !tablaGain) return;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(tablaGain);
  src.start(time);
}

function highlightMatra(idx) {
  matraCells.forEach((cell, i) => {
    cell.classList.toggle("active", i === idx);
    cell.classList.toggle("sam-beat", i === idx && TEENTAL.sequence[i].sam);
  });
}

function clearHighlight() {
  matraCells.forEach((c) => c.classList.remove("active", "sam-beat"));
}
