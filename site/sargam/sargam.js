/* Sargam UI — no top-level CDN imports (those can block the whole module). */

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
let refreshToken = localStorage.getItem("sargam_refresh_token") || "";
let supabase = null;
let config = null;
let me = null;
let pendingEmail = localStorage.getItem("sargam_pending_email") || "";
let pendingOtpType = localStorage.getItem("sargam_pending_otp_type") || "";
let pendingOtpLength = Number(localStorage.getItem("sargam_pending_otp_length") || "8") || 8;
let authPhase = "email"; // email | otp | signed_in
let verifying = false;
let sending = false;

function setStatus(msg, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("is-error", Boolean(isError && msg));
}

function setAuthStatus(msg, isError = false) {
  if (!authStatusEl) return;
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
  if (text.includes("failed to fetch") || text.includes("networkerror") || text.includes("could not reach")) {
    return "Could not reach Sargam. Wait a few seconds and try again (the server may be waking up).";
  }
  if (text.includes("wait") && text.includes("another code")) return msg;
  if (text.includes("rate limit") || text.includes("email rate")) {
    return "Too many sign-in emails. Wait a minute and try again.";
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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      signal: ctrl.signal,
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
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Request timed out. The server may be waking up — try again.");
    }
    if (err instanceof TypeError) {
      throw new Error(friendlyError("failed to fetch"));
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function renderPacks(packs) {
  if (!packsEl) return;
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

let lastGenMode = null;

function selectedMode() {
  const checked = document.querySelector('input[name="gen-mode"]:checked');
  return checked?.value === "song" ? "song" : "clip";
}

function modeMeta(modeId) {
  const modes = me?.modes || config?.modes || [];
  return modes.find((m) => m.id === modeId) || null;
}

function applyModeUi() {
  const mode = selectedMode();
  const meta = modeMeta(mode);
  const lyricsBlock = $("lyrics-block");
  const promptLabel = $("prompt-label");
  const prompt = $("prompt");
  const duration = $("duration");
  const isSong = mode === "song";

  if (lyricsBlock) lyricsBlock.hidden = !isSong;
  if (promptLabel) promptLabel.textContent = isSong ? "Style & mood" : "Prompt";
  if (prompt) {
    prompt.placeholder = isSong
      ? "Bollywood romantic ballad, warm strings, soft vocals, rainy-night feel, 72 BPM"
      : "A calm afternoon tanpura-like drone with soft tabla pulses and warm harmonium, 72 BPM, meditative";
  }
  if (duration) {
    const max = meta?.max_duration_sec || (isSong ? 240 : 180);
    const fallback = meta?.default_duration || (isSong ? 60 : 30);
    duration.max = max;
    duration.min = isSong ? 30 : 5;
    if (lastGenMode !== mode) {
      duration.value = String(fallback);
      lastGenMode = mode;
    } else if (Number(duration.value || 0) > max) {
      duration.value = String(max);
    }
  }
  updateCostHint();
}

function updateCostHint() {
  const duration = Number($("duration")?.value || 30);
  const per = me?.seconds_per_credit || config?.seconds_per_credit || 30;
  const cost = Math.max(1, Math.ceil(duration / per));
  const hint = $("cost-hint");
  if (hint) {
    const mode = selectedMode() === "song" ? "Full song" : "Music sketch";
    hint.textContent = `${mode} · about ${cost} credit${cost === 1 ? "" : "s"} (${per}s per credit).`;
  }
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
        ? `We sent an ${pendingOtpLength || 8}-digit code to ${pendingEmail}. Enter every digit below.`
        : `Enter the ${pendingOtpLength || 8}-digit code from your email.`;
    }
  }

  const gen = $("generate-btn");
  const prompt = $("prompt");
  const duration = $("duration");
  if (gen) gen.disabled = !signedIn;
  if (prompt) prompt.disabled = !signedIn;
  if (duration) duration.disabled = !signedIn;

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
  if (creditChip) creditChip.textContent = "0 credits";
  if (authChip) authChip.textContent = "Not signed in";
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
  if (creditChip) creditChip.textContent = `${me.credits} credit${me.credits === 1 ? "" : "s"}`;
  const signedIn = Boolean(accessToken) && !me.is_anonymous;
  if (authChip) {
    authChip.textContent = signedIn ? (me.email ? me.email : "Signed in") : "Not signed in";
  }

  if (signedIn) {
    const emailEl = $("signed-in-email");
    const creditsEl = $("signed-in-credits");
    if (emailEl) emailEl.textContent = me.email || "Signed in";
    if (creditsEl) creditsEl.textContent = `${me.credits} credit${me.credits === 1 ? "" : "s"} ready to use.`;
    setAuthPhase("signed_in", { focus: false });
  } else if (authPhase !== "otp") {
    applySignedOutUi();
  }

  const duration = $("duration");
  if (duration) duration.max = me.max_duration_sec || 180;
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
  const mode = selectedMode();
  const prompt = ($("prompt")?.value || "").trim();
  const lyrics = ($("lyrics")?.value || "").trim();
  const instrumental = Boolean($("instrumental")?.checked);
  const duration = Number($("duration")?.value || (mode === "song" ? 60 : 30));
  if (prompt.length < 3) {
    setStatus(mode === "song" ? "Describe the style and mood a bit more." : "Enter a longer prompt.", true);
    return;
  }
  const genBtn = $("generate-btn");
  if (genBtn) genBtn.disabled = true;
  setStatus(
    mode === "song"
      ? "Writing your song — this can take a couple of minutes…"
      : "Generating sketch — this can take up to a minute…",
  );
  if (player) player.hidden = true;
  try {
    const payload = { mode, prompt, duration };
    if (mode === "song") {
      payload.lyrics = instrumental ? "" : lyrics;
      payload.instrumental = instrumental;
    }
    const out = await api("/api/v1/sargam/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (creditChip) creditChip.textContent = `${out.credits_remaining} credits`;
    if (out.audio_url && player) {
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
    if (genBtn) genBtn.disabled = !accessToken;
    try { await refreshMe(); } catch (_e) { /* ignore */ }
  }
}

async function ensureSupabase() {
  if (!config?.supabase_url || !config?.supabase_anon_key) return null;
  if (supabase) return supabase;
  try {
    const mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabase = mod.createClient(config.supabase_url, config.supabase_anon_key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
    return supabase;
  } catch (_err) {
    return null;
  }
}

function setSessionToken(access, refresh = "") {
  accessToken = access || "";
  refreshToken = refresh || "";
  if (accessToken) {
    localStorage.setItem("sargam_access_token", accessToken);
    if (refreshToken) localStorage.setItem("sargam_refresh_token", refreshToken);
    localStorage.removeItem("sargam_pending_email");
    localStorage.removeItem("sargam_pending_otp_type");
    localStorage.removeItem("sargam_pending_otp_length");
    pendingEmail = "";
    pendingOtpType = "";
    pendingOtpLength = 8;
  } else {
    localStorage.removeItem("sargam_access_token");
    localStorage.removeItem("sargam_refresh_token");
  }
}

async function applySession(session, successMsg = "Signed in. You can generate below.") {
  const access = session?.access_token || "";
  if (!access) return false;
  setSessionToken(access, session?.refresh_token || refreshToken);
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
  event?.stopPropagation?.();
  if (sending) return;
  const email = (emailInput?.value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    setAuthStatus("Enter a valid email address.", true);
    emailInput?.focus();
    return;
  }
  const sendBtn = $("send-code-btn");
  const resendBtn = $("resend-code-btn");
  sending = true;
  if (sendBtn) sendBtn.disabled = true;
  if (resendBtn) resendBtn.disabled = true;
  setAuthStatus("Sending your code… (first try can take up to a minute)");
  const slow = setTimeout(() => {
    setAuthStatus("Still sending — waking the server, hang on…");
  }, 4000);
  try {
    const out = await api("/api/v1/sargam/auth/send-code", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    pendingOtpType = out.verification_type || "";
    pendingOtpLength = Number(out.otp_length || 8) || 8;
    if (pendingOtpType) localStorage.setItem("sargam_pending_otp_type", pendingOtpType);
    localStorage.setItem("sargam_pending_otp_length", String(pendingOtpLength));
    if (otpInput) {
      otpInput.value = "";
      otpInput.maxLength = pendingOtpLength;
      otpInput.placeholder = "•".repeat(pendingOtpLength);
    }
    setAuthPhase("otp", { email: out.email || email, focus: true });
    setAuthStatus(
      `Code sent to ${out.email || email}. Enter all ${pendingOtpLength} digits in step 2 (check spam if needed).`,
    );
    focusAuth();
  } catch (err) {
    setAuthStatus(friendlyError(err.message || "Could not send sign-in email"), true);
  } finally {
    clearTimeout(slow);
    sending = false;
    if (sendBtn) sendBtn.disabled = false;
    if (resendBtn) resendBtn.disabled = false;
  }
}

async function verifyOtpCode(event) {
  event?.preventDefault?.();
  if (verifying) return;
  const email = (emailInput?.value || pendingEmail || "").trim().toLowerCase();
  const token = (otpInput?.value || "").replace(/\D/g, "");
  const need = pendingOtpLength || 8;
  if (!email || !email.includes("@")) {
    setAuthStatus("Enter the same email you used to request the code.", true);
    setAuthPhase("email");
    return;
  }
  if (token.length < need) {
    setAuthStatus(`Enter all ${need} digits from your email.`, true);
    otpInput?.focus();
    return;
  }
  const btn = $("verify-otp-btn");
  if (btn) btn.disabled = true;
  verifying = true;
  setAuthStatus("Verifying…");
  try {
    const out = await api("/api/v1/sargam/auth/verify-code", {
      method: "POST",
      body: JSON.stringify({
        email,
        token,
        verification_type: pendingOtpType || localStorage.getItem("sargam_pending_otp_type") || null,
      }),
    });
    // Prefer persisting via Supabase client when available; otherwise store tokens directly.
    const client = await ensureSupabase();
    if (client && out.refresh_token) {
      try {
        const { data, error } = await client.auth.setSession({
          access_token: out.access_token,
          refresh_token: out.refresh_token,
        });
        if (!error && data.session) {
          await applySession(data.session);
          return;
        }
      } catch (_e) { /* fall through */ }
    }
    await applySession({
      access_token: out.access_token,
      refresh_token: out.refresh_token || "",
    });
  } catch (err) {
    setAuthStatus(friendlyError(err.message || "Could not verify that code"), true);
  } finally {
    verifying = false;
    if (btn) btn.disabled = false;
  }
}

function changeEmail(event) {
  event?.preventDefault?.();
  if (otpInput) otpInput.value = "";
  pendingOtpType = "";
  localStorage.removeItem("sargam_pending_otp_type");
  setAuthPhase("email", { email: pendingEmail || emailInput?.value || "", focus: true });
  setAuthStatus("Enter the email you want to use.");
}

async function signOut() {
  const client = await ensureSupabase();
  if (client) {
    try { await client.auth.signOut(); } catch (_e) { /* ignore */ }
  }
  setSessionToken("");
  me = null;
  applySignedOutUi();
  setAuthStatus("Signed out. Enter your email to sign in again.");
  setStatus("");
  focusAuth();
}

async function syncSession() {
  // Local token is enough for API calls; Supabase client is optional.
  if (accessToken) return;

  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const authError = url.searchParams.get("error_description") || url.searchParams.get("error");
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : "");
  const hashToken = hashParams.get("access_token");
  const hashError = hashParams.get("error_description") || hashParams.get("error");

  if (!(authError || hashError || tokenHash || code || hashToken)) {
    cleanAuthParamsFromUrl();
    return;
  }

  const client = await ensureSupabase();
  if (!client) {
    if (hashToken) {
      await applySession({
        access_token: hashToken,
        refresh_token: hashParams.get("refresh_token") || "",
      });
    } else if (authError || hashError) {
      setAuthStatus(friendlyError(decodeURIComponent(authError || hashError)), true);
      setAuthPhase(pendingEmail ? "otp" : "email");
    }
    cleanAuthParamsFromUrl();
    return;
  }

  const otpType = url.searchParams.get("type") || "email";
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
    }
  } finally {
    cleanAuthParamsFromUrl();
  }
}

async function boot() {
  setAuthPhase(pendingEmail ? "otp" : "email", { focus: false });
  setAuthStatus("Step 1: enter your email, then tap Email me a code.");
  try {
    config = await api("/api/v1/sargam/config");
    applyModeUi();
    await syncSession();
    try {
      await refreshMe();
    } catch (err) {
      if (err.status === 401) {
        setSessionToken("");
        applySignedOutUi();
      } else throw err;
    }
    const params = new URLSearchParams(location.search);
    if (params.get("checkout") === "success") setStatus("Payment received. Your credits will appear shortly.");
    if (params.get("checkout") === "cancel") setStatus("Checkout canceled.");
    if (!accessToken && !params.get("checkout")) {
      if (authPhase === "otp") {
        setAuthStatus(`Enter the ${pendingOtpLength || 8}-digit code we sent to ${pendingEmail || "your email"}.`);
      } else {
        setAuthStatus("Step 1: enter your email, then tap Email me a code.");
      }
    }
  } catch (err) {
    // Keep the sign-in form usable even if config/me failed (cold start, etc.).
    setAuthStatus(
      "Server is waking up. You can still enter your email and tap Email me a code.",
      true,
    );
    if (authChip) authChip.textContent = "Connecting…";
    applySignedOutUi();
  }
}

function bindUi() {
  authForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (authPhase === "otp") verifyOtpCode(event);
    else sendCode(event);
  });
  $("send-code-btn")?.addEventListener("click", sendCode);
  $("verify-otp-btn")?.addEventListener("click", verifyOtpCode);
  $("resend-code-btn")?.addEventListener("click", sendCode);
  $("change-email-btn")?.addEventListener("click", changeEmail);
  $("signout-btn")?.addEventListener("click", signOut);
  $("generate-btn")?.addEventListener("click", generate);
  $("duration")?.addEventListener("input", updateCostHint);
  document.querySelectorAll('input[name="gen-mode"]').forEach((el) => {
    el.addEventListener("change", applyModeUi);
  });
  $("instrumental")?.addEventListener("change", () => {
    const lyrics = $("lyrics");
    if (lyrics) lyrics.disabled = Boolean($("instrumental")?.checked);
  });
  applyModeUi();

  otpInput?.addEventListener("input", () => {
    const need = pendingOtpLength || 8;
    const digits = (otpInput.value || "").replace(/\D/g, "").slice(0, need);
    otpInput.value = digits;
    clearTimeout(otpInput._autoVerifyTimer);
    if (digits.length === need) {
      otpInput._autoVerifyTimer = setTimeout(() => {
        if ((otpInput.value || "").replace(/\D/g, "").length === need) verifyOtpCode();
      }, 120);
    }
  });

  window.__sargamReady = true;
  document.documentElement.dataset.sargamReady = "1";
}

bindUi();
boot();
