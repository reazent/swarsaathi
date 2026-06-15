// Pitch Finder tool: search a song -> show its Sa.

import { $, artworkGradient, friendlyError, getJSON, metaLine, postJSON } from "./shared.js";

let searchInput, suggestionsEl, welcomePanel, resultSection, resultTitle, resultMeta,
  artworkEl, statusEl, statusText, pitchCard, pitchValue, pitchSa, pitchTip;

let results = [];
let activeIndex = -1;
let searchTimer = null;
let searchSeq = 0;
let onQuotaExceeded = () => {};
let onAnalyzed = () => {};

export function init(opts = {}) {
  onQuotaExceeded = opts.onQuotaExceeded || onQuotaExceeded;
  onAnalyzed = opts.onAnalyzed || onAnalyzed;
  searchInput = $("search");
  suggestionsEl = $("suggestions");
  welcomePanel = $("welcome");
  resultSection = $("result");
  resultTitle = $("result-title");
  resultMeta = $("result-meta");
  artworkEl = $("artwork");
  statusEl = $("status");
  statusText = $("status-text");
  pitchCard = $("pitch-card");
  pitchValue = $("pitch-value");
  pitchSa = $("pitch-sa");
  pitchTip = $("pitch-tip");

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const term = searchInput.value.trim();
    if (term.length < 1) {
      hideSuggestions();
      return;
    }
    searchTimer = setTimeout(() => runSearch(term), 180);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (suggestionsEl.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIndex + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIndex - 1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) selectTrack(results[activeIndex]);
    } else if (e.key === "Escape") { hideSuggestions(); }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) hideSuggestions();
  });
}

async function runSearch(term) {
  const seq = ++searchSeq;
  try {
    const data = await getJSON(`/api/v1/search?q=${encodeURIComponent(term)}&limit=10`);
    if (seq !== searchSeq) return;
    results = data.results || [];
    renderSuggestions();
  } catch (err) {
    console.error(err);
  }
}

function renderSuggestions() {
  suggestionsEl.innerHTML = "";
  activeIndex = -1;
  if (!results.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No songs found — try another spelling";
    suggestionsEl.appendChild(li);
    suggestionsEl.hidden = false;
    return;
  }
  results.forEach((track, i) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    const art = document.createElement("span");
    art.className = "s-art";
    art.style.background = artworkGradient(track.track_id || track.title);
    const copy = document.createElement("div");
    copy.className = "s-copy";
    const title = document.createElement("div");
    title.className = "s-title";
    title.textContent = track.title;
    const sub = document.createElement("div");
    sub.className = "s-sub";
    sub.textContent = metaLine(track);
    copy.append(title, sub);
    li.append(art, copy);
    li.addEventListener("click", () => selectTrack(track));
    li.addEventListener("mouseenter", () => setActive(i));
    suggestionsEl.appendChild(li);
  });
  suggestionsEl.hidden = false;
}

function setActive(idx) {
  const items = [...suggestionsEl.querySelectorAll("li")].filter((el) => !el.classList.contains("empty"));
  if (!items.length) return;
  activeIndex = (idx + items.length) % items.length;
  items.forEach((el, i) => el.classList.toggle("active", i === activeIndex));
  items[activeIndex].scrollIntoView({ block: "nearest" });
}

function hideSuggestions() {
  suggestionsEl.hidden = true;
  activeIndex = -1;
}

// Public: load + display a track's pitch (used by Pitch Finder and Discover).
export async function showTrack(track) {
  hideSuggestions();
  if (searchInput) searchInput.value = track.title;
  welcomePanel.hidden = true;
  resultSection.hidden = false;
  pitchCard.hidden = true;
  statusEl.hidden = false;
  statusText.textContent = "Finding pitch…";

  resultTitle.textContent = track.title;
  resultMeta.textContent = metaLine(track);
  artworkEl.style.background = artworkGradient(track.track_id || track.title);

  try {
    let pitch;
    if (track.has_pitch) {
      pitch = await getJSON(`/api/v1/tracks/${encodeURIComponent(track.track_id)}/pitch`);
    } else {
      pitch = await postJSON(`/api/v1/tracks/${encodeURIComponent(track.track_id)}/analyze`);
      onAnalyzed(); // refresh remaining-quota chip after a fresh analysis
    }
    showPitch(pitch);
    statusEl.hidden = true;
    pitchCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    if (err.status === 402) {
      statusText.textContent = "You've reached today's free pitch limit. Upgrade to Pro for unlimited lookups.";
      onQuotaExceeded();
      return;
    }
    statusText.textContent = friendlyError(err.message);
  }
}

const selectTrack = showTrack;

function showPitch(pitch) {
  pitchCard.hidden = false;
  pitchValue.textContent = pitch.sa_note;
  pitchSa.textContent = "Sa · the home note for this song";
  pitchTip.textContent = "Tune your harmonium, tanpura, or keyboard to this note before you sing or play along.";
}
