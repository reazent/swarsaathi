/* McLeod pitch fallback for pitch-worker.js (classic worker, no modules). */

self.mcleodPitch = function mcleodPitch(signal, sampleRate, minFreq, maxFreq) {
  if (!signal?.length) return { freq: -1, confidence: 0 };

  const n = signal.length;
  const curve = new Float32Array(n);
  for (let tau = 0; tau < n; tau += 1) {
    let ac = 0;
    let norm = 0;
    for (let i = 0; i < n - tau; i += 1) {
      ac += signal[i] * signal[i + tau];
      norm += signal[i] ** 2 + signal[i + tau] ** 2;
    }
    curve[tau] = norm > 0 ? (2 * ac) / norm : 0;
  }

  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / minFreq));
  let start = minLag;
  while (start < maxLag && curve[start] <= 0) start += 1;
  if (start >= maxLag) return { freq: -1, confidence: 0 };

  let peakLag = start;
  let peakVal = curve[start];
  for (let i = start + 1; i < maxLag; i += 1) {
    if (curve[i] > peakVal) {
      peakVal = curve[i];
      peakLag = i;
    }
  }
  if (peakVal < 0.5) return { freq: -1, confidence: 0 };

  const x0 = curve[peakLag - 1] || peakVal;
  const x1 = peakVal;
  const x2 = curve[peakLag + 1] || peakVal;
  const denom = x0 + x2 - 2 * x1;
  const shift = denom ? (x0 - x2) / (2 * denom) : 0;
  const lag = peakLag + shift;
  return {
    freq: sampleRate / lag,
    confidence: Math.min(1, Math.max(0, peakVal)),
  };
};
