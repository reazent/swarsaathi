// McLeod Pitch Method — lightweight JS fallback when Essentia confidence is low.
// Based on the NSDF peak-picking approach (McLeod & Wyvill, 2005).

const DEFAULT_CUTOFF = 0.93;
const SMALL_CUTOFF = 0.5;

function nsdf(signal) {
  const n = signal.length;
  const out = new Float32Array(n);
  for (let tau = 0; tau < n; tau += 1) {
    let ac = 0;
    let norm = 0;
    for (let i = 0; i < n - tau; i += 1) {
      ac += signal[i] * signal[i + tau];
      norm += signal[i] ** 2 + signal[i + tau] ** 2;
    }
    out[tau] = norm > 0 ? (2 * ac) / norm : 0;
  }
  return out;
}

function pickPeak(nsdfArr, sampleRate, minFreq, maxFreq) {
  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(nsdfArr.length - 1, Math.ceil(sampleRate / minFreq));
  let start = minLag;
  while (start < maxLag && nsdfArr[start] <= 0) start += 1;
  if (start >= maxLag) return null;

  let peakLag = start;
  let peakVal = nsdfArr[start];
  for (let i = start + 1; i < maxLag; i += 1) {
    if (nsdfArr[i] > peakVal) {
      peakVal = nsdfArr[i];
      peakLag = i;
    }
  }

  if (peakVal < SMALL_CUTOFF) return null;

  // Parabolic interpolation around peak.
  const x0 = nsdfArr[peakLag - 1] || peakVal;
  const x1 = peakVal;
  const x2 = nsdfArr[peakLag + 1] || peakVal;
  const denom = x0 + x2 - 2 * x1;
  const shift = denom ? (x0 - x2) / (2 * denom) : 0;
  const lag = peakLag + shift;
  const freq = sampleRate / lag;
  const confidence = Math.min(1, Math.max(0, peakVal));
  return { freq, confidence };
}

export function mcleodPitch(signal, sampleRate, minFreq = 45, maxFreq = 1100) {
  if (!signal?.length) return { freq: -1, confidence: 0 };
  const curve = nsdf(signal);
  const peak = pickPeak(curve, sampleRate, minFreq, maxFreq);
  if (!peak) return { freq: -1, confidence: 0 };
  return peak;
}
