// SwarPractice pitch detection — normalized autocorrelation with saptak-safe peak picking.

export const FMIN = 45;
export const FMAX = 1100;
export const SILENCE_RMS = 0.0025;

export function foldFundamental(freq) {
  let f = freq;
  while (f > FMAX * 1.02) f /= 2;
  while (f < FMIN * 0.98) f *= 2;
  return f;
}

export function autoCorrelate(b, sampleRate, { silenceRms = SILENCE_RMS } = {}) {
  const SIZE = b.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i += 1) rms += b[i] * b[i];
  rms = Math.sqrt(rms / SIZE);
  const NONE = { freq: -1, clarity: 0, rms };
  if (rms < silenceRms) return NONE;

  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i += 1) {
    if (Math.abs(b[i]) < thres) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i += 1) {
    if (Math.abs(b[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  }

  const signal = b.subarray(r1, r2);
  const n = signal.length;

  const minLag = Math.floor(sampleRate / FMAX);
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / FMIN));
  if (maxLag <= minLag + 2) return NONE;

  const corr = new Float32Array(maxLag + 2);
  for (let lag = 0; lag <= maxLag + 1; lag += 1) {
    let ac = 0;
    let norm = 0;
    for (let i = 0; i < n - lag; i += 1) {
      const a = signal[i];
      const bb = signal[i + lag];
      ac += a * bb;
      norm += a * a + bb * bb;
    }
    corr[lag] = norm > 0 ? (2 * ac) / norm : 0;
  }

  let bestLag = -1;
  let bestVal = 0;
  const peaks = [];
  for (let lag = minLag + 1; lag < maxLag; lag += 1) {
    const val = corr[lag];
    if (val <= 0.45 || val < corr[lag - 1] || val <= corr[lag + 1]) continue;
    peaks.push({ lag, val });
    if (val > bestVal) {
      bestVal = val;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || bestVal < 0.5) return NONE;

  const cutoff = Math.max(0.55, bestVal * 0.9);
  let chosen = peaks.find((peak) => peak.val >= cutoff) || { lag: bestLag, val: bestVal };

  // If the first acceptable peak is a strong harmonic, its 2x lag is clearly
  // stronger. Correct one octave only in that case; never blindly keep folding.
  const doubled = peaks.find((peak) => Math.abs(peak.lag - chosen.lag * 2) <= 2);
  if (doubled && doubled.val > chosen.val + 0.04) chosen = doubled;

  const clarity = Math.min(1, Math.max(0, bestVal));

  let T0 = chosen.lag;
  const x1 = corr[T0 - 1] || 0;
  const x2 = corr[T0];
  const x3 = corr[T0 + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const bb = (x3 - x1) / 2;
  if (a) T0 -= bb / (2 * a);

  return { freq: sampleRate / T0, clarity, rms };
}
