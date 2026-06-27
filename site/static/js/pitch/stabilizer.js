import {
  CENTS_SMOOTH,
  FMAX,
  FMIN,
  FREQ_RING,
  HOLD_MS,
  NOTE_SWITCH_CENTS,
  NOTE_SWITCH_FRAMES,
  formatSaptakLabel,
  midiName,
  midiToFreq,
  saptakTier,
} from "./constants.js";
import { foldFundamental } from "./detect.js";

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Same lock/smooth pipeline as Riyaz — no octave heuristics layered on top. */
export class PitchStabilizer {
  constructor({ saMidi, swaras }) {
    this.saMidi = saMidi;
    this.swaras = swaras;
    this.reset();
  }

  setSaMidi(saMidi) {
    this.saMidi = saMidi;
    this.reset();
  }

  reset() {
    this.smoothFreq = 0;
    this.smoothCents = 0;
    this.freqRing = [];
    this.lockedOffset = null;
    this.candidateOffset = null;
    this.candidateCount = 0;
    this.lastRender = null;
    this.lastVoiceAt = 0;
  }

  process(rawFreq, { isVoice, now = performance.now() } = {}) {
    if (!isVoice || rawFreq < FMIN || rawFreq > FMAX) {
      if (now - this.lastVoiceAt > HOLD_MS) {
        this.lockedOffset = null;
        this.candidateOffset = null;
        this.candidateCount = 0;
        this.lastRender = null;
        return null;
      }
      return this.lastRender;
    }

    this.lastVoiceAt = now;
    const folded = foldFundamental(rawFreq);
    this.freqRing.push(folded);
    if (this.freqRing.length > FREQ_RING) this.freqRing.shift();

    const med = this.freqRing.length >= 3 ? median(this.freqRing) : folded;
    this.smoothFreq = this.smoothFreq ? this.smoothFreq * 0.6 + med * 0.4 : med;

    const saFreq = midiToFreq(this.saMidi);
    const offset = Math.round(12 * Math.log2(this.smoothFreq / saFreq));
    const prevLocked = this.lockedOffset;

    if (this.lockedOffset === null) {
      this.lockedOffset = offset;
      this.candidateOffset = null;
      this.candidateCount = 0;
    } else if (offset !== this.lockedOffset) {
      const lockedTarget = midiToFreq(this.saMidi + this.lockedOffset);
      const centsFromLocked = 1200 * Math.log2(this.smoothFreq / lockedTarget);
      if (Math.abs(centsFromLocked) >= NOTE_SWITCH_CENTS) {
        if (this.candidateOffset === offset) this.candidateCount += 1;
        else {
          this.candidateOffset = offset;
          this.candidateCount = 1;
        }
        if (this.candidateCount >= NOTE_SWITCH_FRAMES) {
          this.lockedOffset = offset;
          this.candidateOffset = null;
          this.candidateCount = 0;
          this.smoothCents = 0;
        }
      } else {
        this.candidateOffset = null;
        this.candidateCount = 0;
      }
    } else {
      this.candidateOffset = null;
      this.candidateCount = 0;
    }

    const lockedMidi = this.saMidi + this.lockedOffset;
    const lockedTarget = midiToFreq(lockedMidi);
    const cents = 1200 * Math.log2(this.smoothFreq / lockedTarget);
    this.smoothCents = this.smoothCents
      ? this.smoothCents * CENTS_SMOOTH + cents * (1 - CENTS_SMOOTH)
      : cents;

    const idx = ((this.lockedOffset % 12) + 12) % 12;

    this.lastRender = {
      idx,
      saptak: saptakTier(this.lockedOffset),
      lockedOffset: this.lockedOffset,
      lockedMidi,
      cents: this.smoothCents,
      swara: this.swaras[idx],
      western: midiName(lockedMidi),
      freq: this.smoothFreq,
      saptakChanged: prevLocked != null && prevLocked !== this.lockedOffset,
    };
    return this.lastRender;
  }
}

export { formatSaptakLabel, midiName, midiToFreq, saptakTier };
