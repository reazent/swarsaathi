# SwarPractice architecture

SwarPractice is SwarSaathi's real-time practice tool for Indian music learners. Its job is to help a learner set their Sa, understand swaras across saptaks, practice in timed or free mode, review results, and improve.

## Product contract

- **Notation first:** show standard swara identity and saptak: Mandra, Madhya, Taar.
- **Sa-relative:** the selected Sa is Madhya Sa; every detected note is mapped relative to that anchor.
- **Practice modes:** timed drills auto-finish; free practice stops into a review summary.
- **Feedback:** live swara, western note, Hz, cents trace, accuracy, stability, best hold, pitch bias.
- **Privacy and efficiency:** all live pitch work happens on device; no mic audio leaves the browser.

## Runtime pipeline

1. `web/js/milap.js` captures mic frames through `AnalyserNode`.
2. `web/js/pitch/detect.js` estimates raw frequency with normalized autocorrelation.
3. `web/js/pitch/stabilizer.js` median-filters frequency and locks a Sa-relative swara offset.
4. `web/js/pitch/constants.js` maps offset to swara index, western note, and saptak tier.
5. `web/js/milap.js` renders notation and records stable session samples.
6. Summary metrics are computed only from recorded stable samples.

## Why SwarPractice was breaking

The previous detector/lock chain could treat harmonics as fundamentals, or fold already-valid Taar notes down into Madhya. That caused systematic one-saptak mistakes such as Madhya Sa showing as Taar Sa, or Taar Sa showing as Madhya Sa depending on which heuristic was active.

The current detector avoids blind octave folding. It chooses a stable period, corrects a harmonic only when the 2x lag is clearly stronger, and supports low mandra notes down to 45 Hz.

## Acceptance checks

Run:

```bash
cd web
npm run test:pitch
```

Manual mic checks after a hard refresh:

- Sa = C3, sing C2: `Sa · Mandra saptak`, around 65 Hz.
- Sa = C3, sing C3: `Sa · Madhya saptak`, around 131 Hz.
- Sa = C3, sing C4: `Sa · Taar saptak`, around 262 Hz.
- Repeat with Re, Ga, Pa in target mode.
- In free mode, tap Stop to get the session summary.
