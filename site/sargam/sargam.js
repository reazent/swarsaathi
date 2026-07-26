import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const metaApi = document.querySelector('meta[name="swarsaathi-api"]')?.content?.trim();
function defaultApiBase() {
  if (metaApi) return metaApi;
  const stored = localStorage.getItem("swarsaathi_api");
  if (stored) return stored;
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return location.port === "8000" ? "" : "http://127.0.0.1:8000";
  }
  return "";
}
const API_BASE = defaultApiBase();

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const creditChip = $("credit-chip");
const authChip = $("auth-chip");
const packsEl = $("packs");
const player = $("player");
const emailInput = $("email");
const authForm = $("auth-form");

let accessToken = localStorage.getItem("sargam_access_token") || "";
let supabase = null;
let config = null;
let me = null;
let authListenerBound = false;

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
  if (text.includes("redirect") || text.includes("redirect_to")) {
    return "Sign-in redirect is not configured yet. Add https://swarsaathi.com/sargam/** in Supabase Auth URL settings.";
  }
  if (text.includes("rate limit") || text.includes("email rate")) {
    return "Too many sign-in emails. Wait a few minutes and try again.";
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

function redirectTo() {
  const path = location.pathname.endsWith("/") ? location.pathname : `${location.pathname}/`;
  return `${location.origin}${path}`;
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
    btn.disabled = !accessToken;
    btn.title = accessToken ? "" : "Sign in to buy credits";
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

function applySignedOutUi() {
  creditChip.textContent = "0 credits";
  authChip.textContent = "Sign in to generate";
  $("signin-btn").hidden = true;
  $("signout-btn").hidden = true;
  if (authForm) authForm.hidden = false;
  renderPacks(config?.packs || me?.packs || []);
  updateCostHint();
}

async function refreshMe() {
  me = await api("/api/v1/sargam/me");
  creditChip.textContent = `${me.credits} credit${me.credits === 1 ? "" : "s"}`;
  const signedIn = Boolean(accessToken) && !me.is_anonymous;
  authChip.textContent = signedIn
    ? (me.email ? `Signed in as ${me.email}` : "Signed in")
    : "Sign in to generate";
  $("signin-btn").hidden = true;
  $("signout-btn").hidden = !signedIn;
  if (authForm) authForm.hidden = signedIn;
  $("duration").max = me.max_duration_sec || 180;
  renderPacks(me.packs);
  updateCostHint();
}

async function buyPack(packId) {
  if (!accessToken) {
    setStatus("Sign in with email first, then buy credits.", true);
    emailInput?.focus();
    return;
  }
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
  if (!accessToken) {
    setStatus("Sign in with email first to generate audio.", true);
    emailInput?.focus();
    return;
  }
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
  if (!config?.supabase_url || !config?.supabase_anon_key) return null;
  if (!supabase) {
    supabase = createClient(config.supabase_url, config.supabase_anon_key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // We exchange ?code= ourselves in syncSession to avoid double-consume.
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  }
  return supabase;
}

function setSessionToken(token) {
  accessToken = token || "";
  if (accessToken) localStorage.setItem("sargam_access_token", accessToken);
  else localStorage.removeItem("sargam_access_token");
}

async function signIn(event) {
  event?.preventDefault?.();
  const client = await ensureSupabase();
  if (!client) {
    setStatus("Sign-in is temporarily unavailable. Please try again later.", true);
    return;
  }
  const email = (emailInput?.value || "").trim();
  if (!email || !email.includes("@")) {
    setStatus("Enter a valid email address.", true);
    emailInput?.focus();
    return;
  }
  const sendBtn = $("send-link-btn");
  if (sendBtn) sendBtn.disabled = true;
  setStatus("Sending magic link…");
  try {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo(),
        shouldCreateUser: true,
      },
    });
    if (error) setStatus(friendlyError(error.message), true);
    else setStatus(`Check ${email} for the sign-in link. Then return here — this tab will update automatically.`);
  } catch (err) {
    setStatus(friendlyError(err.message || "Could not send sign-in email"), true);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

async function signOut() {
  const client = await ensureSupabase();
  if (client) await client.auth.signOut();
  setSessionToken("");
  me = null;
  applySignedOutUi();
  setStatus("Signed out.");
}

async function syncSession() {
  const client = await ensureSupabase();
  if (!client) return;

  // Finish PKCE / hash redirect from the magic link.
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  const authError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (authError) {
    setStatus(friendlyError(decodeURIComponent(authError)), true);
  } else if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) setStatus(friendlyError(error.message), true);
    else if (data.session?.access_token) {
      setSessionToken(data.session.access_token);
      setStatus("Signed in.");
    }
  } else {
    const { data } = await client.auth.getSession();
    setSessionToken(data.session?.access_token || "");
  }

  if (code || authError || url.hash.includes("access_token") || url.hash.includes("error")) {
    url.searchParams.delete("code");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    url.searchParams.delete("error_code");
    history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  if (!authListenerBound) {
    authListenerBound = true;
    client.auth.onAuthStateChange((_event, session) => {
      setSessionToken(session?.access_token || "");
      refreshMe().catch(() => applySignedOutUi());
    });
  }
}

async function boot() {
  try {
    config = await api("/api/v1/sargam/config");
    await syncSession();
    try {
      await refreshMe();
    } catch (err) {
      if (err.status === 401) applySignedOutUi();
      else throw err;
    }
    const params = new URLSearchParams(location.search);
    if (params.get("checkout") === "success") setStatus("Payment received. Your credits will appear shortly.");
    if (params.get("checkout") === "cancel") setStatus("Checkout canceled.");
    if (!accessToken && !params.get("checkout")) {
      setStatus("Enter your email and we’ll send a magic link to sign in.");
    }
  } catch (err) {
    setStatus("Sargam is temporarily unavailable. Please try again later.", true);
    authChip.textContent = "Unavailable";
    applySignedOutUi();
  }
}

$("generate-btn").addEventListener("click", generate);
$("signout-btn").addEventListener("click", signOut);
$("duration").addEventListener("input", updateCostHint);
authForm?.addEventListener("submit", signIn);
$("signin-btn")?.addEventListener("click", () => {
  authForm.hidden = false;
  emailInput?.focus();
});
boot();
