import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = dirname(webRoot);
const siteRoot = join(projectRoot, "site");
const practiceRoot = join(siteRoot, "practice");
const staticRoot = join(siteRoot, "static");

const staticEntries = ["css", "js", "pitch", "styles.css"];

function buildPracticeHtml(source) {
  const canonical = '  <link rel="canonical" href="https://swarsaathi.com/practice/" />\n';
  const switcher = `
  <nav class="practice-switcher" aria-label="SwarSaathi navigation">
    <a href="/">SwarSaathi home</a>
    <a class="active" href="/practice/" aria-current="page">SwarPractice</a>
    <a href="/support.html" data-ios-app-link data-ready-label="Open iOS app" data-pending-label="iOS app soon">iOS app soon</a>
    <span>v<span data-release-version>1.1 (4)</span></span>
  </nav>
`;

  return source
    .replace("<title>SwarPractice — SwarSaathi</title>", "<title>SwarPractice Web App — SwarSaathi</title>")
    .replace("</head>", `${canonical}</head>`)
    .replace('<body class="launch-milap">', `<body class="launch-milap web-practice">\n${switcher}`)
    .replace(
      '  <script src="/static/js/app.js" type="module"></script>',
      '  <script src="/release-links.js" defer></script>\n  <script src="/static/js/app.js" type="module"></script>',
    );
}

await rm(practiceRoot, { recursive: true, force: true });
await mkdir(practiceRoot, { recursive: true });
await mkdir(staticRoot, { recursive: true });

for (const entry of staticEntries) {
  await rm(join(staticRoot, entry), { recursive: true, force: true });
  await cp(join(webRoot, entry), join(staticRoot, entry), {
    recursive: true,
    force: true,
    errorOnExist: false,
  }).catch((err) => {
    if (err.code !== "ENOENT") throw err;
  });
}

const audioSrc = join(webRoot, "audio");
const audioDest = join(staticRoot, "audio");
await mkdir(audioDest, { recursive: true });
for (const entry of await readdir(audioSrc).catch(() => [])) {
  if (entry === "tanpura") continue;
  await rm(join(audioDest, entry), { recursive: true, force: true });
  await cp(join(audioSrc, entry), join(audioDest, entry), {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
}

await rm(join(staticRoot, "js/pitch/pitch-math.test.js"), { force: true });
await rm(join(staticRoot, "audio/tanpura"), { recursive: true, force: true });
await rm(join(staticRoot, "milap-preview.html"), { force: true });
await rm(join(staticRoot, "js/milap-preview.js"), { force: true });
await rm(join(staticRoot, "css/milap-preview.css"), { force: true });

const webHtml = await readFile(join(webRoot, "index.html"), "utf8");
await writeFile(join(practiceRoot, "index.html"), buildPracticeHtml(webHtml));
await cp(join(webRoot, "sw.js"), join(practiceRoot, "sw.js"));
console.log("Built Cloudflare Pages practice app from web source");
