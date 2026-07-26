const metaApi = document.querySelector('meta[name="swarsaathi-api"]')?.content?.trim();
function defaultApiBase() {
  if (metaApi) return metaApi;
  const stored = localStorage.getItem("swarsaathi_api");
  if (stored) return stored;
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return location.port === "8000" ? "" : "http://127.0.0.1:8000";
  }
  // Same-origin (API reverse-proxy) or set <meta name="swarsaathi-api">.
  return "";
}
const API_BASE = defaultApiBase();

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const creditChip = $("credit-chip");
const authChip = $("auth-chip");
const packsEl = $("packs");
const player = $("player");

let accessToken = localStorage.getItem("sargam_access_token") || "";
let supabase = null;
let config = null;
let me = null;

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.style.color = isError ? "#a33" : "";
}

function friendlyError(msg, status) {
  const text = String(msg || "").toLowerCase();
  if (status === 402 || text.includes("insufficient_credits") || text.includes("not enough credits")) {
    return "Not enough credits. Buy a pack below.";
  }
  if (text.includes("fal") || text.includes("balance") || text.includes("top up") || text.includes("locked")) {
    return "Generation is temporarily unavailable. Please try again in a little while.";
  }
  if (text.includes("sign in required") || status === 401) {
    return "Please sign in to continue.";
  }
  if (text.includes("api base") || text.includes("could not reach")) {
    return "Sargam is temporarily unavailable. Please try again later.";
  }
  if (text.includes("supabase")) {
    return "Sign-in is temporarily unavailable. Please try again later.";
  }
  return msg || "Something went wrong.";
}

function authHeaders() {
  const headers = { "Content-Type": "application/json", "X-Client-Id": clientId() };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

function clientId() {
  let id = localStorage.getItem("swarsaathi_client_id");
  if (!id) {
    id = crypto.randomUUID?.() || `c_${Date.now()}`;
    localStorage.setItem("swarsaathi_client_id", id);
  }
  return id;
}

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body.detail;
    let msg = typeof detail === "string" ? detail : detail?.error || detail?.message || "Something went wrong.";
    msg = friendlyError(msg, res.status);
    const err = new Error(msg);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  return body;
}

function renderPacks(packs) {
  packsEl.innerHTML = "";
  for (const pack of packs || []) {
    const row = document.createElement("div");
    row.className = "pack";
    const dollars = (pack.amount_cents / 100).toFixed(0);
    row.innerHTML = `<div><strong>${pack.label}</strong><div>$${dollars}</div></div>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn primary";
    btn.textContent = "Buy";
    btn.addEventListener("click", () => buyPack(pack.id));
    row.appendChild(btn);
    packsEl.appendChild(row);
  }
}

function updateCostHint() {
  const duration = Number($("duration").value || 30);
  const per = me?.seconds_per_credit || config?.seconds_per_credit || 30;
  const cost = Math.max(1, Math.ceil(duration / per));
  $("cost-hint").textContent = `This generation will use about ${cost} credit${cost === 1 ? "" : "s"} (${per}s per credit).`;
}

async function refreshMe() {
  me = await api("/api/v1/sargam/me");
  creditChip.textContent = `${me.credits} credit${me.credits === 1 ? "" : "s"}`;
  authChip.textContent = me.is_anonymous
    ? "Guest"
    : (me.email ? `Signed in as ${me.email}` : "Signed in");
  $("signin-btn").hidden = !me.is_anonymous && Boolean(accessToken);
  $("signout-btn").hidden = me.is_anonymous || !accessToken;
  $("duration").max = me.max_duration_sec || 180;
  renderPacks(me.packs);
  updateCostHint();
}

async function buyPack(packId) {
  try {
    setStatus("Opening checkout…");
    const out = await api("/api/v1/sargam/checkout", {
      method: "POST",
      body: JSON.stringify({ pack_id: packId }),
    });
    if (out.checkout_url) location.href = out.checkout_url;
  } catch (err) {
    setStatus(err.message || "Checkout failed", true);
  }
}

async function generate() {
  const prompt = $("prompt").value.trim();
  const duration = Number($("duration").value || 30);
  if (prompt.length < 3) {
    setStatus("Enter a longer prompt.", true);
    return;
  }
  $("generate-btn").disabled = true;
  setStatus("Generating — this can take up to a minute…");
  player.hidden = true;
  try {
    const out = await api("/api/v1/sargam/generate", {
      method: "POST",
      body: JSON.stringify({ prompt, duration }),
    });
    creditChip.textContent = `${out.credits_remaining} credits`;
    if (out.audio_url) {
      player.src = out.audio_url;
      player.hidden = false;
      player.play?.().catch(() => {});
      setStatus(`Done · charged ${out.credits_charged} credit${out.credits_charged === 1 ? "" : "s"}.`);
    } else {
      setStatus("Generation finished but no audio URL returned.", true);
    }
  } catch (err) {
    if (err.status === 402) setStatus("Not enough credits. Buy a pack below.", true);
    else setStatus(err.message || "Generation failed", true);
  } finally {
    $("generate-btn").disabled = false;
    try { await refreshMe(); } catch (_e) { /* ignore */ }
  }
}

async function ensureSupabase() {
  if (!config?.supabase_url || !config?.supabase_anon_key || !window.supabase) return null;
  if (!supabase) {
    supabase = window.supabase.createClient(config.supabase_url, config.supabase_anon_key);
  }
  return supabase;
}

async function signIn() {
  const client = await ensureSupabase();
  if (!client) {
    setStatus("Sign-in is temporarily unavailable. Please try again later.", true);
    return;
  }
  const email = window.prompt("Email for magic link sign-in:");
  if (!email) return;
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: `${location.origin}${location.pathname}` },
  });
  if (error) setStatus(error.message, true);
  else setStatus("Check your email for the sign-in link.");
}

async function signOut() {
  const client = await ensureSupabase();
  if (client) await client.auth.signOut();
  accessToken = "";
  localStorage.removeItem("sargam_access_token");
  await refreshMe();
  setStatus("Signed out.");
}

async function syncSession() {
  const client = await ensureSupabase();
  if (!client) return;
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token || "";
  accessToken = token;
  if (token) localStorage.setItem("sargam_access_token", token);
  else localStorage.removeItem("sargam_access_token");
  client.auth.onAuthStateChange((_event, session) => {
    accessToken = session?.access_token || "";
    if (accessToken) localStorage.setItem("sargam_access_token", accessToken);
    else localStorage.removeItem("sargam_access_token");
    refreshMe().catch(() => {});
  });
}

async function boot() {
  try {
    config = await api("/api/v1/sargam/config");
    await syncSession();
    await refreshMe();
    const params = new URLSearchParams(location.search);
    if (params.get("checkout") === "success") setStatus("Payment received. Your credits will appear shortly.");
    if (params.get("checkout") === "cancel") setStatus("Checkout canceled.");
  } catch (err) {
    setStatus("Sargam is temporarily unavailable. Please try again later.", true);
    authChip.textContent = "Unavailable";
  }
}

$("generate-btn").addEventListener("click", generate);
$("signin-btn").addEventListener("click", signIn);
$("signout-btn").addEventListener("click", signOut);
$("duration").addEventListener("input", updateCostHint);
boot();
