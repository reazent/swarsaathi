import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(projectRoot, "web", "audio", "tanpura");
const outputRoot = join(projectRoot, "web", "audio", "tanpura-optimized");
const sampleRate = 8000;
const analysisStartSec = 30;
const analysisDurationSec = 300;
const loopDurationSec = 16;
const fadeSec = 0.75;
const aacBitrate = "160k";

function commandExists(command) {
  return spawnSync(command, ["-version"], { stdio: "ignore" }).status === 0;
}

function findFfmpeg() {
  if (process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN;
  if (commandExists("ffmpeg")) return "ffmpeg";
  const python = spawnSync("python3", [
    "-c",
    "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())",
  ], { encoding: "utf8" });
  if (python.status === 0 && python.stdout.trim()) return python.stdout.trim();
  throw new Error("ffmpeg not found. Install ffmpeg or set FFMPEG_BIN.");
}

const ffmpeg = findFfmpeg();

function run(args, options = {}) {
  const result = spawnSync(ffmpeg, args, {
    encoding: options.encoding,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString() || `ffmpeg exited ${result.status}`);
  }
  return result;
}

async function listAudioFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listAudioFiles(path));
    else if ([".mp3", ".m4a", ".wav", ".aiff", ".flac"].includes(extname(entry.name).toLowerCase())) files.push(path);
  }
  return files;
}

function parseFrequency(filename) {
  const match = basename(filename).match(/[=~]\s*([0-9.]+)\s*Hz/i);
  return match ? Number(match[1]) : null;
}

function midiFromFrequency(frequency) {
  return Math.round(69 + 12 * Math.log2(frequency / 440));
}

function filenameForMidi(midi) {
  const names = ["C", "C-sharp", "D", "D-sharp", "E", "F", "F-sharp", "G", "G-sharp", "A", "A-sharp", "B"];
  const name = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}.m4a`;
}

function decodeFloat32(buffer) {
  return new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 4));
}

function rms(samples, from, length) {
  let sum = 0;
  const end = Math.min(samples.length, from + length);
  for (let i = from; i < end; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, end - from));
}

function seamError(samples, first, second, length) {
  let error = 0;
  for (let i = 0; i < length; i += 1) {
    const delta = samples[first + i] - samples[second + i];
    error += delta * delta;
  }
  return Math.sqrt(error / length);
}

function selectLoopStart(samples) {
  const compareSamples = Math.round(sampleRate * 0.12);
  const loopSamples = Math.round(sampleRate * loopDurationSec);
  const fadeSamples = Math.round(sampleRate * fadeSec);
  const stepSamples = Math.round(sampleRate * 0.1);
  let best = { index: Math.round(sampleRate * 30), score: Infinity };

  for (
    let index = Math.round(sampleRate * 5);
    index + fadeSamples + loopSamples + compareSamples < samples.length;
    index += stepSamples
  ) {
    const bodyStart = index + fadeSamples;
    const bodyEnd = bodyStart + loopSamples;
    const startRms = rms(samples, bodyStart, compareSamples);
    const endRms = rms(samples, bodyEnd, compareSamples);
    const level = rms(samples, bodyStart, loopSamples);
    if (level < 0.002) continue;
    const seam = seamError(samples, bodyStart, bodyEnd, compareSamples);
    const levelPenalty = Math.abs(startRms - endRms);
    const transientPenalty = Math.max(0, startRms - level * 1.8) + Math.max(0, endRms - level * 1.8);
    const score = seam + levelPenalty * 1.5 + transientPenalty * 2;
    if (score < best.score) best = { index, score };
  }

  return {
    sourceStartSec: analysisStartSec + best.index / sampleRate,
    seamScore: Number(best.score.toFixed(6)),
  };
}

function analyze(path) {
  const result = run([
    "-v", "error",
    "-ss", String(analysisStartSec),
    "-t", String(analysisDurationSec),
    "-i", path,
    "-ac", "1",
    "-ar", String(sampleRate),
    "-f", "f32le",
    "pipe:1",
  ]);
  return selectLoopStart(decodeFloat32(result.stdout));
}

function exportLoop(source, destination, sourceStartSec) {
  const mainEnd = loopDurationSec;
  const tailEnd = loopDurationSec + fadeSec;
  const filter = [
    `[0:a]asplit=3[headsrc][mainsrc][tailsrc]`,
    `[headsrc]atrim=0:${fadeSec},asetpts=PTS-STARTPTS[head]`,
    `[mainsrc]atrim=${fadeSec}:${mainEnd},asetpts=PTS-STARTPTS[main]`,
    `[tailsrc]atrim=${mainEnd}:${tailEnd},asetpts=PTS-STARTPTS[tail]`,
    `[tail][head]acrossfade=d=${fadeSec}:c1=tri:c2=tri[seam]`,
    `[main][seam]concat=n=2:v=0:a=1[joined]`,
    `[joined]asetpts=N/SR/TB,loudnorm=I=-16:TP=-1.5:LRA=9[out]`,
  ].join(";");
  run([
    "-y",
    "-v", "error",
    "-ss", String(sourceStartSec),
    "-t", String(loopDurationSec + fadeSec),
    "-i", source,
    "-filter_complex", filter,
    "-map", "[out]",
    "-c:a", "aac",
    "-b:a", aacBitrate,
    "-ar", "44100",
    "-ac", "1",
    "-movflags", "+faststart",
    destination,
  ]);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  loopDurationSec,
  fadeSec,
  assets: [],
};

for (const source of await listAudioFiles(sourceRoot)) {
  const frequency = parseFrequency(source);
  if (!frequency) {
    console.warn(`Skipping filename without frequency: ${basename(source)}`);
    continue;
  }
  const mode = basename(dirname(source));
  const midi = midiFromFrequency(frequency);
  const filename = filenameForMidi(midi);
  const modeDir = join(outputRoot, mode);
  const destination = join(modeDir, filename);
  await mkdir(modeDir, { recursive: true });

  console.log(`Analyzing ${mode}/${basename(source)}…`);
  const selection = analyze(source);
  exportLoop(source, destination, selection.sourceStartSec);
  const sourceHash = createHash("sha256").update(await readFile(source)).digest("hex");
  const outputHash = createHash("sha256").update(await readFile(destination)).digest("hex");
  manifest.assets.push({
    mode,
    midi,
    frequency,
    filename,
    path: `${mode}/${filename}`,
    durationSec: loopDurationSec,
    sourceStartSec: Number(selection.sourceStartSec.toFixed(3)),
    seamScore: selection.seamScore,
    encoding: `AAC ${aacBitrate}`,
    sourceHash,
    outputHash,
  });
}

manifest.assets.sort((a, b) => a.mode.localeCompare(b.mode) || a.midi - b.midi);
await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared ${manifest.assets.length} optimized tanpura loops in ${outputRoot}`);
