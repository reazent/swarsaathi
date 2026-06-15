// Discover tool: faceted browse of the catalog.

import { $, artworkGradient, getJSON, metaLine } from "./shared.js";

let onOpenTrack = () => {};
let fText, fSinger, fMd, fDecade, fLabel, fPitch, fHasPitch, fClear, countEl, resultsEl;
let queryTimer = null;
let querySeq = 0;
let loaded = false;

export function init(opts = {}) {
  onOpenTrack = opts.onOpenTrack || onOpenTrack;
  fText = $("f-text");
  fSinger = $("f-singer");
  fMd = $("f-md");
  fDecade = $("f-decade");
  fLabel = $("f-label");
  fPitch = $("f-pitch");
  fHasPitch = $("f-haspitch");
  fClear = $("f-clear");
  countEl = $("discover-count");
  resultsEl = $("discover-results");

  [fSinger, fMd, fDecade, fLabel, fPitch].forEach((el) => el.addEventListener("change", runQuery));
  fHasPitch.addEventListener("change", runQuery);
  fText.addEventListener("input", () => {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(runQuery, 220);
  });
  fClear.addEventListener("click", clearFilters);
}

// Lazy-load facets + first results the first time Discover is opened.
export async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const facets = await getJSON("/api/v1/facets");
    fillSelect(fSinger, facets.singers, "Any singer");
    fillSelect(fMd, facets.music_directors, "Any music director");
    fillSelect(fDecade, facets.decades, "Any decade");
    fillSelect(fLabel, facets.labels, "Any label");
    fillSelect(fPitch, facets.pitches, "Any pitch");
  } catch (err) {
    console.error(err);
  }
  runQuery();
}

function fillSelect(select, values, anyLabel) {
  select.innerHTML = `<option value="">${anyLabel}</option>`;
  (values || []).forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

function decadeToYears(decade) {
  const start = parseInt(String(decade).replace(/\D/g, ""), 10);
  if (Number.isNaN(start)) return [null, null];
  return [start, start + 9];
}

function buildQuery() {
  const params = new URLSearchParams();
  if (fText.value.trim()) params.set("text", fText.value.trim());
  if (fSinger.value) params.set("singer", fSinger.value);
  if (fMd.value) params.set("music_director", fMd.value);
  if (fLabel.value) params.set("label", fLabel.value);
  if (fPitch.value) params.set("sa_note", fPitch.value);
  if (fHasPitch.checked) params.set("has_pitch", "true");
  if (fDecade.value) {
    const [from, to] = decadeToYears(fDecade.value);
    if (from) params.set("year_from", from);
    if (to) params.set("year_to", to);
  }
  params.set("limit", "100");
  return params.toString();
}

async function runQuery() {
  const seq = ++querySeq;
  countEl.textContent = "Searching…";
  try {
    const data = await getJSON(`/api/v1/discover?${buildQuery()}`);
    if (seq !== querySeq) return;
    renderResults(data);
  } catch (err) {
    console.error(err);
    countEl.textContent = "Could not load results.";
  }
}

function renderResults(data) {
  resultsEl.innerHTML = "";
  const total = data.total || 0;
  countEl.textContent = total === 1 ? "1 song" : `${total} songs`;

  if (!total) {
    const empty = document.createElement("p");
    empty.className = "discover-empty";
    empty.textContent = "No songs match these filters. Try clearing one.";
    resultsEl.appendChild(empty);
    return;
  }

  data.results.forEach((track) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "song-card";
    card.addEventListener("click", () => onOpenTrack(track));

    const art = document.createElement("span");
    art.className = "card-art";
    art.style.background = artworkGradient(track.track_id || track.title);
    if (track.sa_note) {
      const badge = document.createElement("span");
      badge.className = "card-pitch";
      badge.textContent = track.sa_note;
      art.appendChild(badge);
    }

    const body = document.createElement("div");
    body.className = "card-body";
    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = track.title;
    const sub = document.createElement("div");
    sub.className = "card-sub";
    sub.textContent = metaLine(track);
    const tags = document.createElement("div");
    tags.className = "card-tags";
    [track.music_director, track.label].filter(Boolean).forEach((t) => {
      const tag = document.createElement("span");
      tag.className = "card-tag";
      tag.textContent = t;
      tags.appendChild(tag);
    });

    body.append(title, sub, tags);
    card.append(art, body);
    resultsEl.appendChild(card);
  });
}

function clearFilters() {
  fText.value = "";
  [fSinger, fMd, fDecade, fLabel, fPitch].forEach((el) => (el.value = ""));
  fHasPitch.checked = false;
  runQuery();
}
