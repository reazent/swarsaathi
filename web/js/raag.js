// Raag Practice — recorded tanpura + tabla, matra display, taal picker (Teental free / Dadra Pro).

import { $ } from "./shared.js";
import * as account from "./account.js";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SA_MIDI_MIN = 43;
const SA_MIDI_MAX = 62;
const SA_MIDI_DEFAULT = 48;
const TANPURA_REF_MIDI = 48; // Sa of the bundled tanpura recording (~C3)

const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);
const midiName = (m) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

const TAALS = {
  teental: {
    id: "teental",
    name: "Teental",
    matras: 16,
    vibhagSize: 4,
    pro: false,
    legend: [
      { label: "X", desc: "Sam", kind: "taali" },
      { label: "2", desc: "Taali", kind: "taali" },
      { label: "0", desc: "Khali", kind: "khali" },
      { label: "3", desc: "Taali", kind: "taali" },
    ],
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
  },
  dadra: {
    id: "dadra",
    name: "Dadra",
    matras: 6,
    vibhagSize: 3,
    pro: true,
    legend: [
      { label: "X", desc: "Sam", kind: "taali" },
      { label: "0", desc: "Khali", kind: "khali" },
    ],
    sequence: [
      { bol: "Dha", sam: "X", kind: "taali" },
      { bol: "Dhin", sam: null, kind: null },
      { bol: "Na", sam: null, kind: null },
      { bol: "Dha", sam: "0", kind: "khali" },
      { bol: "Dhin", sam: null, kind: null },
      { bol: "Na", sam: null, kind: null },
    ],
  },
};

const BOL_SAMPLES = {
  Dha: "/static/audio/tabla/dha.mp3",
  Dhin: "/static/audio/tabla/dhin.mp3",
  Tin: "/static/audio/tabla/tin.mp3",
  Ta: "/static/audio/tabla/ta.mp3",
  Na: "/static/audio/tabla/na.mp3",
};
const TANPURA_SAMPLE = "/static/audio/tanpura/tanpura-drone.mp3";

let saSelect, taalSelect, bpmInput, bpmVal, tanpuraToggle, tablaToggle;
let tanpuraVolInput, tablaVolInput, playBtn, playLabel, statusEl;
let taalTitle, taalLegend, matraGrid;
let matraCells = [];

let saMidi = SA_MIDI_DEFAULT;
let currentTaalId = "teental";
let bpm = 60;
let tanpuraVol = 0.7;
let tablaVol = 0.85;
let playing = false;
let audioCtx = null;
let tanpuraNodes = null;
let tanpuraGain = null;
let tablaGain = null;
let schedulerId = null;
let nextBeatTime = 0;
let currentMatra = 0;
let inited = false;
let sampleBuffers = {};
let tanpuraBuffer = null;
let samplesReady = false;
let samplesLoading = null;

export function init() {
  if (inited) return;
  inited = true;

  saSelect = $("g-sa");
  taalSelect = $("g-taal");
  bpmInput = $("g-bpm");
  bpmVal = $("g-bpm-val");
  tanpuraToggle = $("g-tanpura");
  tablaToggle = $("g-tabla");
  tanpuraVolInput = $("g-tanpura-vol");
  tablaVolInput = $("g-tabla-vol");
  playBtn = $("g-play");
  playLabel = $("g-play-label");
  statusEl = $("g-status");
  taalTitle = $("g-taal-title");
  taalLegend = $("g-taal-legend");
  matraGrid = $("g-matra-grid");

  buildSaOptions();
  buildTaalSelect();
  selectTaal("teental");
  applyVolumes();

  bpmInput.addEventListener("input", () => {
    bpm = parseInt(bpmInput.value, 10);
    bpmVal.textContent = String(bpm);
  });

  saSelect.addEventListener("change", () => {
    saMidi = parseInt(saSelect.value, 10);
    if (playing && tanpuraToggle.checked) restartTanpura();
  });

  taalSelect.addEventListener("change", () => {
    const id = taalSelect.value;
    if (TAALS[id].pro && !account.hasRaagTaal(id)) {
      taalSelect.value = currentTaalId;
      account.openUpgrade();
      return;
    }
    selectTaal(id);
    if (playing) {
      stop();
      start();
    }
  });

  tanpuraVolInput.addEventListener("input", applyVolumes);
  tablaVolInput.addEventListener("input", applyVolumes);

  playBtn.addEventListener("click", () => {
    if (playing) stop();
    else start();
  });

  account.onChange(() => buildTaalSelect());
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

function buildTaalSelect() {
  if (!taalSelect) return;
  const prev = currentTaalId;
  taalSelect.innerHTML = "";
  Object.values(TAALS).forEach((t) => {
    const allowed = account.hasRaagTaal(t.id);
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = allowed ? t.name : `${t.name} · Pro`;
    opt.disabled = t.pro && !allowed;
    taalSelect.appendChild(opt);
  });
  if (account.hasRaagTaal(prev)) selectTaal(prev);
  else selectTaal("teental");
}

function selectTaal(id) {
  currentTaalId = id;
  if (taalSelect) taalSelect.value = id;
  const t = currentTaal();
  if (taalTitle) taalTitle.textContent = `${t.name} · ${t.matras} matras`;
  renderLegend(t);
  buildMatraGrid(t);
}

function renderLegend(t) {
  if (!taalLegend) return;
  taalLegend.innerHTML = "";
  t.legend.forEach((item) => {
    const span = document.createElement("span");
    span.className = `legend-item ${item.kind}`;
    span.innerHTML = item.kind === "khali"
      ? `<strong>${item.label}</strong> ${item.desc}`
      : `<strong>${item.label}</strong> ${item.desc}`;
    taalLegend.appendChild(span);
  });
}

function buildMatraGrid(t) {
  matraGrid.innerHTML = "";
  matraCells = [];
  t.sequence.forEach((m, i) => {
    if (i > 0 && i % t.vibhagSize === 0) {
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

function currentTaal() {
  return TAALS[currentTaalId];
}

function applyVolumes() {
  tanpuraVol = parseInt(tanpuraVolInput?.value || "70", 10) / 100;
  tablaVol = parseInt(tablaVolInput?.value || "85", 10) / 100;
  if (tanpuraGain) tanpuraGain.gain.value = tanpuraVol;
  if (tablaGain) tablaGain.gain.value = tablaVol;
}

function ensureContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  if (!tablaGain) {
    tablaGain = audioCtx.createGain();
    tablaGain.connect(audioCtx.destination);
  }
  if (!tanpuraGain) {
    tanpuraGain = audioCtx.createGain();
    tanpuraGain.connect(audioCtx.destination);
  }
  applyVolumes();
  return audioCtx;
}

async function loadSamples() {
  if (samplesReady) return;
  if (samplesLoading) return samplesLoading;
  samplesLoading = (async () => {
    ensureContext();
    const fetches = [
      ...Object.entries(BOL_SAMPLES).map(async ([bol, url]) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load ${bol}`);
        sampleBuffers[bol] = await audioCtx.decodeAudioData(await res.arrayBuffer());
      }),
      (async () => {
        const res = await fetch(TANPURA_SAMPLE);
        if (!res.ok) throw new Error("Failed to load tanpura");
        tanpuraBuffer = await audioCtx.decodeAudioData(await res.arrayBuffer());
      })(),
    ];
    await Promise.all(fetches);
    samplesReady = true;
  })();
  return samplesLoading;
}

async function start() {
  ensureContext();
  if (!samplesReady) {
    if (statusEl) statusEl.textContent = "Loading samples…";
    try {
      await loadSamples();
    } catch (err) {
      console.error(err);
      if (statusEl) statusEl.textContent = "Couldn't load audio samples — refresh and try again.";
      return;
    }
  }
  playing = true;
  playBtn.classList.add("on");
  playLabel.textContent = "Stop";
  const t = currentTaal();
  statusEl.textContent = `${t.name} · ${bpm} BPM — looping`;

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
  if (!tanpuraBuffer || !audioCtx) return;
  const ctx = audioCtx;
  const src = ctx.createBufferSource();
  src.buffer = tanpuraBuffer;
  src.loop = true;
  src.playbackRate.value = midiToFreq(saMidi) / midiToFreq(TANPURA_REF_MIDI);

  const fade = ctx.createGain();
  fade.gain.value = 0;
  fade.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.6);

  src.connect(fade).connect(tanpuraGain);
  src.start();
  tanpuraNodes = { src, fade };
}

function stopTanpura() {
  if (!tanpuraNodes || !audioCtx) return;
  const { src, fade } = tanpuraNodes;
  try {
    fade.gain.cancelScheduledValues(audioCtx.currentTime);
    fade.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
    src.stop(audioCtx.currentTime + 0.35);
  } catch (_e) {
    /* already stopped */
  }
  tanpuraNodes = null;
}

function scheduleBeats() {
  if (!playing || !audioCtx) return;
  const t = currentTaal();
  const secPerBeat = 60 / bpm;
  const horizon = 0.12;

  while (nextBeatTime < audioCtx.currentTime + horizon) {
    if (tablaToggle.checked) {
      playBol(t.sequence[currentMatra].bol, nextBeatTime);
    }
    const idx = currentMatra;
    const delay = Math.max(0, (nextBeatTime - audioCtx.currentTime) * 1000);
    setTimeout(() => {
      if (playing) highlightMatra(idx, t);
    }, delay);

    nextBeatTime += secPerBeat;
    currentMatra = (currentMatra + 1) % t.matras;
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

function highlightMatra(idx, t) {
  matraCells.forEach((cell, i) => {
    cell.classList.toggle("active", i === idx);
    cell.classList.toggle("sam-beat", i === idx && t.sequence[i].sam);
  });
}

function clearHighlight() {
  matraCells.forEach((c) => c.classList.remove("active", "sam-beat"));
}
