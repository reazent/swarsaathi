(() => {
  const fallback = {
    appName: "SwarSaathi",
    toolName: "SwarPractice",
    version: "1.2",
    build: "7",
    channel: "iOS App Store",
    status: "Live on App Store",
    iosAppUrl: "https://apps.apple.com/app/id6781765064",
    practiceUrl: "/practice/"
  };

  const text = (selector, value) => {
    document.querySelectorAll(selector).forEach((node) => {
      node.textContent = value;
    });
  };

  const applyRelease = (release) => {
    const data = { ...fallback, ...(release || {}) };
    const versionLabel = `v${data.version}${data.build ? ` (${data.build})` : ""}`;
    const iosReady = Boolean(data.iosAppUrl);

    text("[data-release-version]", versionLabel);
    text("[data-release-status]", data.status || fallback.status);
    text("[data-release-channel]", data.channel || fallback.channel);

    document.querySelectorAll("[data-ios-app-link]").forEach((link) => {
      if (iosReady) {
        link.href = data.iosAppUrl;
        link.target = "_blank";
        link.rel = "noopener";
        link.classList.remove("app-link-pending");
        link.removeAttribute("aria-disabled");
        if (link.dataset.readyLabel) link.textContent = link.dataset.readyLabel;
      } else {
        link.href = "/support.html";
        link.removeAttribute("target");
        link.removeAttribute("rel");
        link.classList.add("app-link-pending");
        link.setAttribute("aria-disabled", "true");
        if (link.dataset.pendingLabel) link.textContent = link.dataset.pendingLabel;
      }
    });
  };

  fetch("/release.json", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : fallback))
    .then(applyRelease)
    .catch(() => applyRelease(fallback));
})();
