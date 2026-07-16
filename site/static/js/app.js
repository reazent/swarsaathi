// App shell — SwarPractice-first launch. Other tools stay in codebase, hidden until ready.

import * as milap from "./milap.js";
import * as account from "./account.js";

/** Set false to restore full SwarSaathi nav (Pitch, Discover, Raag). */
export const MILAP_LAUNCH = true;

if ("serviceWorker" in navigator && !window.Capacitor) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // The app remains usable online if service-worker registration is unavailable.
    });
  });
}

const views = {
  milap: document.getElementById("view-milap"),
  pitch: document.getElementById("view-pitch"),
  discover: document.getElementById("view-discover"),
  riyaz: document.getElementById("view-riyaz"),
  raag: document.getElementById("view-raag"),
};

function switchTo(name) {
  Object.entries(views).forEach(([key, el]) => {
    if (el) el.hidden = key !== name;
  });
  document.querySelectorAll("[data-view]").forEach((btn) => {
    if (btn.tagName === "BUTTON") btn.classList.toggle("active", btn.dataset.view === name);
  });
  if (name !== "milap") milap.suspend();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function wireNav() {
  document.querySelectorAll(".nav-item, .mobile-tabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTo(btn.dataset.view));
  });
}

if (MILAP_LAUNCH) {
  account.init();
  milap.init();
  wireNav();
  switchTo("milap");
} else {
  const pitch = await import("./pitch.js");
  const discover = await import("./discover.js");
  const riyaz = await import("./riyaz.js");
  const raag = await import("./raag.js");

  account.init();
  pitch.init({
    onQuotaExceeded: () => account.openUpgrade(),
    onAnalyzed: () => account.refresh(),
  });
  discover.init({
    onOpenTrack: (track) => {
      switchTo("pitch");
      pitch.showTrack(track);
    },
  });
  riyaz.init();
  raag.init();
  wireNav();
  switchTo("pitch");
}
