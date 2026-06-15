// App shell: routes between tools and wires cross-tool actions.

import * as pitch from "./pitch.js";
import * as discover from "./discover.js";
import * as riyaz from "./riyaz.js";
import * as account from "./account.js";

const views = {
  pitch: document.getElementById("view-pitch"),
  discover: document.getElementById("view-discover"),
  riyaz: document.getElementById("view-riyaz"),
};

function switchTo(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
  document.querySelectorAll("[data-view]").forEach((btn) => {
    if (btn.tagName === "BUTTON") btn.classList.toggle("active", btn.dataset.view === name);
  });
  if (name === "discover") discover.ensureLoaded();
  if (name !== "riyaz") riyaz.suspend(); // free the mic when leaving Riyaz
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function wireNav() {
  document.querySelectorAll(".nav-item, .mobile-tabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTo(btn.dataset.view));
  });
}

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
wireNav();
switchTo("pitch");
