// Shared helpers used across tools.

export const $ = (id) => document.getElementById(id);

// Stable per-device id so the backend can meter free-tier usage (pre-auth).
export function clientId() {
  let id = localStorage.getItem("swarsaathi_client_id") || localStorage.getItem("shruti_client_id");
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
  localStorage.setItem("swarsaathi_client_id", id);
  return id;
}

function authHeaders() {
  return { "X-Client-Id": clientId() };
}

const PALETTE = [
  ["#ff7d6e", "#9b7bff"],
  ["#ffb347", "#ff6cab"],
  ["#5fd4c7", "#9b7bff"],
  ["#ff6cab", "#ffb347"],
  ["#9b7bff", "#5fd4c7"],
  ["#7ea6ff", "#5fd4c7"],
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function artworkGradient(seed) {
  const pair = PALETTE[hashString(seed || "swarsaathi") % PALETTE.length];
  return `linear-gradient(145deg, ${pair[0]}, ${pair[1]})`;
}

export function metaLine(track) {
  return [track.singer, track.film, track.year].filter(Boolean).join(" · ");
}

export function friendlyError(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("ffmpeg")) return "We couldn't read this recording yet. Please try again in a moment.";
  if (text.includes("not found") || text.includes("missing")) return "This song isn't in our library yet.";
  return "Something went wrong. Please try another song.";
}

function toError(body, status) {
  const detail = body && body.detail;
  const message = (detail && (detail.message || detail)) || `Request failed (${status})`;
  const err = new Error(typeof message === "string" ? message : `Request failed (${status})`);
  err.status = status;
  err.detail = detail;
  return err;
}

export async function getJSON(url) {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw toError(await res.json().catch(() => ({})), res.status);
  return res.json();
}

export async function postJSON(url) {
  const res = await fetch(url, { method: "POST", headers: authHeaders() });
  if (!res.ok) throw toError(await res.json().catch(() => ({})), res.status);
  return res.json();
}

export function getMe() {
  return getJSON("/api/v1/me");
}
