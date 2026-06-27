import assert from "node:assert/strict";
import { autoCorrelate } from "./detect.js";
import { PitchStabilizer } from "./stabilizer.js";
import { applyVocalOctaveCorrection, midiToFreq, saptakTier } from "./constants.js";

const SAMPLE_RATE = 48_000;
const FRAME_SIZE = 4096;
const SWARAS = Array.from({ length: 12 }, (_, idx) => ({ idx, letter: String(idx), variant: "shuddha" }));

function centsBetween(a, b) {
  return 1200 * Math.log2(a / b);
}

function synth(freq, { fundamental = 0.7, secondHarmonic = 0.25 } = {}) {
  const out = new Float32Array(FRAME_SIZE);
  for (let i = 0; i < out.length; i += 1) {
    out[i] =
      fundamental * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE)
      + secondHarmonic * Math.sin((2 * Math.PI * 2 * freq * i) / SAMPLE_RATE);
  }
  return out;
}

function assertDetected(expectedFreq, options) {
  const result = autoCorrelate(synth(expectedFreq, options), SAMPLE_RATE);
  assert.ok(result.freq > 0, `expected ${expectedFreq} Hz to be detected`);
  assert.ok(
    Math.abs(centsBetween(result.freq, expectedFreq)) < 8,
    `expected ${expectedFreq.toFixed(2)} Hz, got ${result.freq.toFixed(2)} Hz`,
  );
  assert.ok(result.clarity >= 0.5, `expected usable clarity, got ${result.clarity}`);
}

function stabilize(freq) {
  const stabilizer = new PitchStabilizer({ saMidi: 48, swaras: SWARAS });
  let render = null;
  for (let i = 0; i < 10; i += 1) {
    render = stabilizer.process(freq, { isVoice: true, now: i * 16 });
  }
  return render;
}

assert.equal(saptakTier(-12), -1);
assert.equal(saptakTier(-1), -1);
assert.equal(saptakTier(0), 0);
assert.equal(saptakTier(11), 0);
assert.equal(saptakTier(12), 1);

assert.equal(applyVocalOctaveCorrection(midiToFreq(36), 48, true), midiToFreq(36));
assert.equal(applyVocalOctaveCorrection(midiToFreq(43), 48, true), midiToFreq(43));
assert.equal(applyVocalOctaveCorrection(midiToFreq(48), 48, true), midiToFreq(36));
assert.equal(applyVocalOctaveCorrection(midiToFreq(60), 48, true), midiToFreq(48));
assert.equal(applyVocalOctaveCorrection(midiToFreq(48), 48, false), midiToFreq(48));

assertDetected(midiToFreq(36)); // C2, mandra Sa when Sa is C3.
assertDetected(midiToFreq(48)); // C3, madhya Sa.
assertDetected(midiToFreq(60)); // C4, taar Sa.
assertDetected(midiToFreq(48), { fundamental: 0.25, secondHarmonic: 0.75 });

assert.equal(stabilize(midiToFreq(36)).saptak, -1);
assert.equal(stabilize(midiToFreq(48)).saptak, 0);
assert.equal(stabilize(midiToFreq(60)).saptak, 1);

console.log("pitch math ok");
