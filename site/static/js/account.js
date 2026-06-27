// Account state: tier, entitlements, remaining free lookups + the upgrade modal.
// Reads /api/v1/me. Billing (RevenueCat/Stripe) plugs in later behind the same data.

import { $, getMe } from "./shared.js";

let me = null;
const listeners = new Set();

let chipTier, chipMeta, upgradeBtn, modal, modalClose;

const FREE_FALLBACK = {
  tier: "free",
  entitlements: { tier: "free" },
  fresh_analyses_remaining: null,
};

export function init() {
  chipTier = $("acct-tier");
  chipMeta = $("acct-meta");
  upgradeBtn = $("acct-upgrade");
  modal = $("upgrade-modal");
  modalClose = $("upgrade-close");

  if (upgradeBtn) upgradeBtn.addEventListener("click", openUpgrade);
  if (modalClose) modalClose.addEventListener("click", closeUpgrade);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeUpgrade();
    });
  }
  document.querySelectorAll("[data-upgrade-cta]").forEach((b) => b.addEventListener("click", closeUpgrade));

  refresh();
}

export async function refresh() {
  try {
    me = await getMe();
  } catch {
    me = FREE_FALLBACK;
  }
  render();
  listeners.forEach((fn) => fn(me));
  return me;
}

export function get() {
  return me;
}

export function isPro() {
  return !!me && me.tier === "pro";
}

export function can(feature) {
  return !!(me && me.entitlements && me.entitlements[feature]);
}

export function hasRaagTaal(taalId) {
  const list = me?.entitlements?.raag_taals || ["teental"];
  return list.includes(taalId);
}

export function remaining() {
  return me ? me.fresh_analyses_remaining : null; // null = unlimited
}

export function onChange(fn) {
  listeners.add(fn);
  if (me) fn(me);
}

function render() {
  if (!chipTier) return;
  const pro = isPro();
  chipTier.textContent = pro ? "Pro" : "Free";
  chipTier.classList.toggle("pro", pro);
  if (pro) {
    chipMeta.textContent = "Unlimited lookups";
    if (upgradeBtn) upgradeBtn.hidden = true;
  } else {
    const r = remaining();
    chipMeta.textContent = r === null ? "" : `${r} song ${r === 1 ? "pitch" : "pitches"} left today`;
    if (upgradeBtn) upgradeBtn.hidden = false;
  }
}

export function openUpgrade() {
  if (modal) modal.hidden = false;
}

export function closeUpgrade() {
  if (modal) modal.hidden = true;
}
