import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const staticDir = join(dist, "static");

const rootPages = [
  "index.html",
  "privacy.html",
  "support.html",
];

const staticEntries = [
  "css",
  "js",
  "pitch",
  "styles.css",
];

await rm(dist, { recursive: true, force: true });
await mkdir(staticDir, { recursive: true });

for (const page of rootPages) {
  await cp(join(root, page), join(dist, page));
}

for (const entry of staticEntries) {
  await cp(join(root, entry), join(staticDir, entry), {
    recursive: true,
    force: true,
    errorOnExist: false,
  }).catch((err) => {
    if (err.code !== "ENOENT") throw err;
  });
}

// Copy small bundled audio assets, but keep large tanpura recordings in R2/CDN.
const audioSrc = join(root, "audio");
const audioDest = join(staticDir, "audio");
await mkdir(audioDest, { recursive: true });
for (const entry of await readdir(audioSrc).catch(() => [])) {
  if (entry === "tanpura") continue;
  await cp(join(audioSrc, entry), join(audioDest, entry), {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
}

await rm(join(staticDir, "js/pitch/pitch-math.test.js"), { force: true });
await rm(join(staticDir, "audio/tanpura"), { recursive: true, force: true });

await writeFile(
  join(dist, "assetlinks-placeholder.txt"),
  "Native app build output for SwarPractice by SwarSaathi.\n",
);

console.log("Built Capacitor web bundle in web/dist");
