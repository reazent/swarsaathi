// Shared pitch-engine constants (SwarPractice + future mobile shell).

export const FMIN = 45;
export const FMAX = 1100;
export const FREQ_RING = 9;
export const NOTE_SWITCH_FRAMES = 4;
export const NOTE_SWITCH_CENTS = 38;
export const CENTS_SMOOTH = 0.82;
export const HOLD_MS = 900;

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);
export const midiName = (m) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

export function applyVocalOctaveCorrection(freq, saMidi, enabled = true) {
  if (!enabled || freq <= 0) return freq;
  const corrected = freq / 2;
  const saFreq = midiToFreq(saMidi);
  if (freq < saFreq * 0.98) return freq;
  if (corrected < FMIN) return freq;
  return corrected;
}

export function saptakTier(offset) {
  const octave = Math.floor(offset / 12);
  if (octave >= 1) return 1;
  if (octave <= -1) return -1;
  return 0;
}

export function formatSaptakLabel(tier) {
  if (tier < 0) return "Mandra saptak";
  if (tier > 0) return "Taar saptak";
  return "Madhya saptak";
}
