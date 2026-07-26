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
const authStatusEl = $("auth-status");
const creditChip = $("credit-chip");
const authChip = $("auth-chip");
const packsEl = $("packs");
const player = $("player");
const emailInput = $("email");
const otpInput = $("otp");
const authForm = $("auth-form");
const accountPanel = $("account-panel");
const composePanel = $("compose-panel");
const composeGate = $("compose-gate");
const stepEmail = $("step-email");
const stepOtp = $("step-otp");
const signedInBar = $("signed-in-bar");
const authLede = $("auth-lede");
const accountTitle = $("account-title");

let accessToken = localStorage.getItem("sargam_access_token") || "";
let supabase = null;
let config = null;
let me = null;
let authListenerBound = false;
let pendingEmail = localStorage.getItem("sargam_pending_email") || "";
let pendingOtpType = localStorage.getItem("sargam_pending_otp_type") || "";
let authPhase = "email"; // email | otp | signed_in

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("is-error", Boolean(isError && msg));
}

function setAuthStatus(msg, isError = false) {
  authStatusEl.textContent = msg || "";
  authStatusEl.classList.toggle("is-error", Boolean(isError && msg));
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
  if (text.includes("wait") && text.includes("another code")) {
    return msg;
  }
  if (text.includes("rate limit") || text.includes("email rate")) {
    return "Too many sign-in emails. Wait a minute and try again.";
  }
  if (
    text.includes("pkce")
    || text.includes("code verifier")
    || text.includes("both auth code and code verifier")
  ) {
    return "That email link can’t finish sign-in here. Enter the code from your email instead.";
  }
  if (text.includes("otp") || text.includes("token") || text.includes("invalid") || text.includes("expired")) {
    return "That code is invalid or expired. Resend a new code and try again.";
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

function focusAuth() {
  accountPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (authPhase === "otp") otpInput?.focus();
  else emailInput?.focus();
}

function setAuthPhase(phase, { email = pendingEmail, focus = true } = {}) {
  authPhase = phase;
  pendingEmail = (email || "").trim();
  if (pendingEmail) localStorage.setItem("sargam_pending_email", pendingEmail);
  else localStorage.removeItem("sargam_pending_email");

  const signedIn = phase === "signed_in";
  accountPanel?.classList.toggle("is-signed-in", signedIn);
  composePanel?.classList.toggle("compose-panel-locked", !signedIn);
  if (composeGate) composeGate.hidden = signedIn;
  if (signedInBar) signedInBar.hidden = !signedIn;
  if (authForm) authForm.hidden = signedIn;
  if (authLede) authLede.hidden = signedIn;

  if (accountTitle) {
    accountTitle.textContent = signedIn ? "Account" : (phase === "otp" ? "Enter your code" : "Sign in");
  }

  if (stepEmail) {
    stepEmail.hidden = signedIn;
    stepEmail.classList.toggle("is-active", phase === "email");
    stepEmail.classList.toggle("is-done", phase === "otp");
  }
  if (stepOtp) {
    stepOtp.hidden = signedIn || phase !== "otp";
    stepOtp.classList.toggle("is-active", phase === "otp");
  }

  if (emailInput && pendingEmail) emailInput.value = pendingEmail;
  if (phase === "otp") {
    const hint = $("otp-hint");
    if (hint) {
      hint.textContent = pendingEmail
        ? `We sent a code to ${pendingEmail}. Enter it below to finish signing in.`
        : "Enter the code from your email to finish signing in.";
    }
  }

  $("generate-btn").disabled = !signedIn;
  $("prompt").disabled = !signedIn;
  $("duration").disabled = !signedIn;

  if (focus && !signedIn) {
    requestAnimationFrame(() => {
      if (phase === "otp") {
        otpInput?.focus();
        otpInput?.select?.();
      } else {
        emailInput?.focus();
      }
    });
  }
}

function applySignedOutUi() {
  creditChip.textContent = "0 credits";
  authChip.textContent = "Not signed in";
  renderPacks(config?.packs || me?.packs || []);
  updateCostHint();
  if (pendingEmail && localStorage.getItem("sargam_pending_email")) {
    setAuthPhase("otp", { email: pendingEmail, focus: false });
  } else {
    setAuthPhase("email", { email: "", focus: false });
  }
}

async function refreshMe() {
  me = await api("/api/v1/sargam/me");
  creditChip.textContent = `${me.credits} credit${me.credits === 1 ? "" : "s"}`;
  const signedIn = Boolean(accessToken) && !me.is_anonymous;
  authChip.textContent = signedIn
    ? (me.email ? me.email : "Signed in")
    : "Not signed in";

  if (signedIn) {
    $("signed-in-email").textContent = me.email || "Signed in";
    $("signed-in-credits").textContent = `${me.credits} credit${me.credits === 1 ? "" : "s"} ready to use.`;
    setAuthPhase("signed_in", { focus: false });
  } else if (authPhase !== "otp") {
    applySignedOutUi();
  }

  $("duration").max = me.max_duration_sec || 180;
  renderPacks(me.packs);
  updateCostHint();
}

async function buyPack(packId) {
  if (!accessToken) {
    setAuthStatus("Sign in first, then buy credits.", true);
    setAuthPhase(pendingEmail ? "otp" : "email");
    focusAuth();
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
    setAuthStatus("Sign in to generate audio.", true);
    setAuthPhase(pendingEmail ? "otp" : "email");
    focusAuth();
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
    $("generate-btn").disabled = !accessToken;
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
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  }
  return supabase;
}

function setSessionToken(token) {
  accessToken = token || "";
  if (accessToken) {
    localStorage.setItem("sargam_access_token", accessToken);
    localStorage.removeItem("sargam_pending_email");
    localStorage.removeItem("sargam_pending_otp_type");
    pendingEmail = "";
    pendingOtpType = "";
  } else {
    localStorage.removeItem("sargam_access_token");
  }
}

async function applySession(session, successMsg = "Signed in. You can generate below.") {
  if (!session?.access_token) return false;
  setSessionToken(session.access_token);
  setAuthStatus(successMsg);
  setStatus(successMsg);
  await refreshMe().catch(() => {});
  composePanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  $("prompt")?.focus();
  return true;
}

function cleanAuthParamsFromUrl() {
  const url = new URL(location.href);
  const keys = ["code", "token_hash", "type", "error", "error_description", "error_code"];
  let changed = false;
  for (const key of keys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (url.hash.includes("access_token") || url.hash.includes("error")) changed = true;
  if (changed) history.replaceState({}, "", `${url.pathname}${url.search}`);
}

async function sendCode(event) {
  event?.preventDefault?.();
  const email = (emailInput?.value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    setAuthStatus("Enter a valid email address.", true);
    emailInput?.focus();
    return;
  }
  const sendBtn = $("send-code-btn");
  const resendBtn = $("resend-code-btn");
  if (sendBtn) sendBtn.disabled = true;
  if (resendBtn) resendBtn.disabled = true;
  setAuthStatus("Sending your code…");
  try {
    const out = await api("/api/v1/sargam/auth/send-code", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    pendingOtpType = out.verification_type || "";
    if (pendingOtpType) localStorage.setItem("sargam_pending_otp_type", pendingOtpType);
    if (otpInput) otpInput.value = "";
    setAuthPhase("otp", { email: out.email || email, focus: true });
    setAuthStatus(`Code sent to ${out.email || email}. Check your inbox (and spam), then enter it in step 2.`);
    focusAuth();
  } catch (err) {
    setAuthStatus(friendlyError(err.message || "Could not send sign-in email"), true);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    if (resendBtn) resendBtn.disabled = false;
  }
}

async function verifyOtpCode() {
  const client = await ensureSupabase();
  if (!client) {
    setAuthStatus("Sign-in is temporarily unavailable. Please try again later.", true);
    return;
  }
  const email = (emailInput?.value || pendingEmail || "").trim().toLowerCase();
  const token = (otpInput?.value || "").replace(/\s+/g, "");
  if (!email || !email.includes("@")) {
    setAuthStatus("Enter the same email you used to request the code.", true);
    setAuthPhase("email");
    return;
  }
  if (!/^\d{6,8}$/.test(token)) {
    setAuthStatus("Enter the full code from your email.", true);
    otpInput?.focus();
    return;
  }
  const btn = $("verify-otp-btn");
  if (btn) btn.disabled = true;
  setAuthStatus("Verifying…");
  try {
    const preferred = pendingOtpType || localStorage.getItem("sargam_pending_otp_type") || "";
    const types = [...new Set([preferred, "email", "magiclink", "signup"].filter(Boolean))];
    let session = null;
    let lastError = null;
    for (const type of types) {
      const { data, error } = await client.auth.verifyOtp({ email, token, type });
      if (!error && data.session) {
        session = data.session;
        break;
      }
      lastError = error;
    }
    if (!session) {
      setAuthStatus(friendlyError(lastError?.message || "Could not verify that code"), true);
      return;
    }
    await applySession(session);
  } catch (err) {
    setAuthStatus(friendlyError(err.message || "Could not verify that code"), true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function changeEmail() {
  if (otpInput) otpInput.value = "";
  pendingOtpType = "";
  localStorage.removeItem("sargam_pending_otp_type");
  setAuthPhase("email", { email: pendingEmail || emailInput?.value || "", focus: true });
  setAuthStatus("Enter the email you want to use.");
}

async function signOut() {
  const client = await ensureSupabase();
  if (client) await client.auth.signOut();
  setSessionToken("");
  me = null;
  applySignedOutUi();
  setAuthStatus("Signed out. Enter your email to sign in again.");
  setStatus("");
  focusAuth();
}

async function syncSession() {
  const client = await ensureSupabase();
  if (!client) return;

  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type") || "email";
  const authError = url.searchParams.get("error_description") || url.searchParams.get("error");
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : "");
  const hashToken = hashParams.get("access_token");
  const hashError = hashParams.get("error_description") || hashParams.get("error");

  try {
    if (authError || hashError) {
      setAuthStatus(friendlyError(decodeURIComponent(authError || hashError)), true);
      setAuthPhase(pendingEmail ? "otp" : "email");
    } else if (tokenHash) {
      const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
      if (error) {
        setAuthStatus(friendlyError(error.message), true);
        setAuthPhase(pendingEmail ? "otp" : "email");
      } else {
        await applySession(data.session);
      }
    } else if (code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error) {
        setAuthStatus(friendlyError(error.message), true);
        setAuthPhase(pendingEmail ? "otp" : "email");
      } else {
        await applySession(data.session);
      }
    } else if (hashToken) {
      const { data, error } = await client.auth.setSession({
        access_token: hashToken,
        refresh_token: hashParams.get("refresh_token") || "",
      });
      if (error) {
        setAuthStatus(friendlyError(error.message), true);
        setAuthPhase(pendingEmail ? "otp" : "email");
      } else {
        await applySession(data.session);
      }
    } else {
      const { data } = await client.auth.getSession();
      setSessionToken(data.session?.access_token || "");
    }
  } finally {
    cleanAuthParamsFromUrl();
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
  setAuthPhase(pendingEmail ? "otp" : "email", { focus: false });
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
      if (authPhase === "otp") {
        setAuthStatus(`Enter the code we sent to ${pendingEmail || "your email"}.`);
      } else {
        setAuthStatus("Step 1: enter your email and we’ll send a one-time code.");
      }
    }
  } catch (err) {
    setAuthStatus("Sargam is temporarily unavailable. Please try again later.", true);
    authChip.textContent = "Unavailable";
    applySignedOutUi();
  }
}

authForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (authPhase === "otp") verifyOtpCode();
  else sendCode(event);
});
$("send-code-btn")?.addEventListener("click", sendCode);
$("verify-otp-btn")?.addEventListener("click", verifyOtpCode);
$("resend-code-btn")?.addEventListener("click", sendCode);
$("change-email-btn")?.addEventListener("click", changeEmail);
$("signout-btn")?.addEventListener("click", signOut);
$("generate-btn").addEventListener("click", generate);
$("duration").addEventListener("input", updateCostHint);

otpInput?.addEventListener("input", () => {
  const digits = (otpInput.value || "").replace(/\D/g, "").slice(0, 8);
  otpInput.value = digits;
  // Auto-verify when a full OTP arrives (6–8 digits depending on Supabase).
  if (/^\d{6,8}$/.test(digits) && digits.length >= 6) {
    // Prefer 8 if that's what they keep typing; wait briefly for 8th digit.
    clearTimeout(otpInput._autoVerifyTimer);
    otpInput._autoVerifyTimer = setTimeout(() => {
      if (/^\d{6,8}$/.test(otpInput.value)) verifyOtpCode();
    }, digits.length >= 8 ? 50 : 450);
  }
});

boot();
