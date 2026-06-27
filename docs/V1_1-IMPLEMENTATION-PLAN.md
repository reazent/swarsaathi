# SwarSaathi / SwarPractice v1.1 implementation plan

This document captures the agreed v1.1 scope so the work can be resumed with a short prompt later. It is a planning checklist only; do not treat unchecked items as implemented.

## Release intent

v1.1 should make SwarPractice feel more reliable, more musical, and more polished while keeping the current app/web architecture. The same improvements should apply to the iOS Capacitor app and the SwarSaathi web app because both share the `web/` codebase.

Primary goals:

- Detect softer singing more reliably.
- Make the pitch wave calmer and more helpful without hiding accuracy.
- Recalibrate scoring so it better reflects real singing.
- Tighten the session UI before, during, and after practice.
- Add minimal real-audio accompaniment: tanpura now, metronome now, tabla wiring later.
- Rework the public website to feel like a learner/product-forward SwarSaathi platform site.


## Implementation status as of 2026-06-27

Completed locally:

- Softer mic detection thresholds for web and iOS shell.
- Calmer wave with steady/tolerance bands.
- Separate visual cents from scoring cents.
- Less punitive stability scoring, with ongoing calibration expected for Expert.
- `YOUR SA` -> `YOUR PITCH` in active SwarPractice UI.
- Premium mode split: **Riyaz** and **Accompaniment**.
- Accompaniment mode hides target note, wave, session, and summary UI.
- Persistent accompaniment mini-bar in Riyaz mode.
- Real tanpura playback from R2 using octave-specific filenames.
- Unsupported tanpura pitch options disabled while accompaniment needs a matching loop.
- Metronome with BPM and taal/cycle selector.
- Tabla placeholder disabled until real loops are uploaded.
- Learner/product-forward website homepage expanded locally.
- R2 audio docs and upload script added.
- Mobile bundle excludes large tanpura audio and was synced to iOS.

Still pending/manual:

- Deploy the updated `site/` folder to Cloudflare Pages.
- Continue Expert stability calibration from more real users and benchmark samples.
- Verify all R2 tanpura files by pitch/tuning after uploads.
- Add real tabla loops when available.
- Add App Store live link to website after approval/release.
- Confirm App Store Connect marketing/support/privacy URLs manually.

## Confirmed product decisions

- Parent brand: **SwarSaathi**.
- Current app/tool: **SwarPractice**.
- Public App Store / home-screen name remains **SwarSaathi**.
- Pitch selector label should change from **YOUR SA** to **YOUR PITCH**.
- Upcoming products on the website should use non-obvious, brandable names. Avoid obvious public labels such as “Song Pitch Finder” or “Notation Generator” as final product names.
- Website tone should be learner/product-forward, with partnerships as a secondary section/menu item.
- App Store metadata should link to the SwarSaathi website:
  - Marketing: `https://swarsaathi.com`
  - Support: `https://swarsaathi.com/support.html`
  - Privacy: `https://swarsaathi.com/privacy.html`

## App and web pitch-detection improvements

### Mic sensitivity

Goal: softer sung audio should be detected without making room noise trigger false notes.

Checklist:

- [ ] Lower current mic/voice gate thresholds in `web/js/milap.js`.
- [ ] Keep separate iOS/native-shell handling because iPhone mic behavior differs from desktop browsers.
- [ ] Tune these areas carefully:
  - `ABS_MIN_RMS`
  - `SILENCE_RMS`
  - `displayEnergyGate()`
  - `detectionSilenceRms()`
  - `voiceGate()`
  - `voiceMinClarity()`
- [ ] Preserve noise-floor calibration so quiet rooms and noisy rooms behave differently.
- [ ] Avoid appending wave/scoring samples during true silence.
- [ ] Confirm softer singing is caught on both iOS and web.

### Wave visualization

Goal: make the wave assistive, not jumpy or visually intimidating.

Checklist:

- [ ] Reduce vertical exaggeration of the wave.
- [ ] Add a clear center line at 0 cents.
- [ ] Add a visually distinct “steady” band around center, for example ±5 cents.
- [ ] Add tolerance bands based on selected level:
  - Beginner: wide tolerance.
  - Intermediate: medium tolerance.
  - Expert: tighter tolerance.
- [ ] Make “steady” visually obvious through color, glow, or filled band treatment.
- [ ] Keep the actual pitch deviation visible enough that users can correct themselves.
- [ ] Make the wave block shorter/crisper before session start.
- [ ] Make the summary wave/post-session area shorter/crisper after the session ends.

### Separate visual smoothness from scoring

Goal: the wave can be calmer without hiding pitch accuracy in scores.

Checklist:

- [ ] Maintain separate streams/values for:
  - scoring cents: used for scoring and session metrics.
  - visual cents: smoothed/slew-limited for wave rendering only.
- [ ] Ensure visual smoothing does not make the score artificially better.
- [ ] Ensure scoring still captures meaningful pitch wobble and drift.
- [ ] Document the distinction in code comments where the streams split.

### Stability scoring recalibration

Goal: scoring should better match real singing while still rewarding steadiness. Current formula is too strict, especially at Expert.

Checklist:

- [ ] Review current score calculation in `web/js/milap.js`.
- [ ] Separate accuracy from stability where possible.
- [ ] Ignore or downweight short attack/settling periods at the beginning of voiced notes.
- [ ] Prefer robust statistics such as median absolute deviation, percentiles, or sustained-window jitter over punishing every tiny wobble.
- [ ] Recalibrate Expert so it remains challenging but not unfair.
- [ ] Keep Beginner and Intermediate encouraging and musically meaningful.
- [ ] Show clear score explanations after a session if layout allows.

### Benchmarking

Goal: tune against credible musical references, especially iTablaPro.

Checklist:

- [ ] Create a small benchmark checklist or doc for manual comparison.
- [ ] Benchmark against **iTablaPro** using the same sustained notes and durations.
- [ ] Use consistent Sa/pitch, device distance, room, and duration.
- [ ] Suggested tests:
  - Soft voice sustained Sa for 5s, 10s, 20s.
  - Medium voice sustained Sa for 5s, 10s, 20s.
  - Sustained Pa and Ma.
  - Slightly sharp/flat singing to observe tolerance display.
  - Expert-level steady note test.
- [ ] Compare:
  - quiet-voice detection,
  - visual steadiness,
  - response latency,
  - tolerance feel,
  - perceived scoring fairness.

## UI polish

### Pitch selector label

Checklist:

- [ ] Replace **YOUR SA** with **YOUR PITCH** everywhere in app/web UI.
- [ ] Ensure the shared pitch selector controls vocal reference pitch, tanpura pitch, and tabla pitch for v1.1.

### Wave block and post-session layout

Checklist:

- [ ] Find and review the screenshot(s) in the project folder showing the wave block and post-session staggered layout.
- [ ] Reduce excess vertical space before the session starts.
- [ ] Reduce excess vertical space after the session ends.
- [ ] Fix staggered post-session UI:
  - align score cards,
  - normalize margins,
  - make summary/wave/actions feel intentionally grouped,
  - verify mobile layout.
- [ ] Keep the app visually crisp on iPhone-sized screens.

## Accompaniment v1.1

### Scope

Confirmed v1.1 accompaniment scope:

- Tanpura: implement now using real uploaded audio files.
- Metronome: implement now using generated Web Audio click; no external files required.
- Tabla: plan/wire structure now, but keep disabled/placeholders until tabla loops are uploaded.
- Tabla should use real audio loops when available.
- Accompaniment should work in both app and web.

### Shared pitch selector

Checklist:

- [ ] Use one shared **YOUR PITCH** selector for:
  - vocal reference pitch,
  - tanpura pitch,
  - tabla pitch/tonal center where applicable.
- [ ] Do not add separate tanpura/tabla pitch selectors in v1.1.
- [ ] Ensure pitch changes restart or retune accompaniment cleanly.

### Tanpura audio assets

User has uploaded real tanpura recordings under a `tanpura` folder in two tuning-type subfolders:

- `tanpura/Sa-Pa/`
  - Perfect 5th / classic two-tone drone.
  - Pattern: **Pa-Sa-Sa-_Sa_**.
  - Numerical representation: **5-1-1-_1_**.
  - The final `_Sa_` / `_1_` means lower/mandra Sa.

- `tanpura/Sa-ma/`
  - Perfect 4th / inverted perfect fifth.
  - Pattern: **ma-Sa-Sa-_Sa_**.
  - Numerical representation: **4-1-1-_1_**.
  - The final `_Sa_` / `_1_` means lower/mandra Sa.

Checklist:

- [ ] Locate uploaded tanpura files and document exact paths/filenames.
- [ ] Add tanpura mode selector:
  - `Sa-Pa`
  - `Sa-ma`
- [ ] Use real audio loops only; do not use synthesized tanpura for shipping.
- [ ] Verify loop quality and loop boundaries.
- [ ] If available pitch coverage is limited, choose the safest pitch-shift strategy and document limitations.
- [ ] If sample quality is not acceptable, keep the feature hidden/disabled rather than shipping a poor tanpura.

### Metronome

Goal: provide rhythmic practice immediately, before tabla loops are ready.

Checklist:

- [ ] Add metronome toggle.
- [ ] Add BPM selector/control.
- [ ] Generate click sounds via Web Audio.
- [ ] Accent the first beat of the selected cycle.
- [ ] Reuse taal/cycle metadata so tabla can plug into the same control later.
- [ ] Support at least the cycles for the initial tabla taals:
  - Teentaal: 16 beats.
  - Keharwa: 8 beats.
  - Dadra: 6 beats.
  - Ektaal: 12 beats.
  - Rupak: 7 beats.

### Tabla plan

Tabla recordings are not uploaded yet.

Confirmed initial tabla taals for v1.1/v1.2 expansion:

- Teentaal
- Keharwa
- Dadra
- Ektaal
- Rupak

Checklist:

- [ ] Add disabled/placeholder tabla UI only if it does not confuse users.
- [ ] Prepare an asset manifest format for tabla loops.
- [ ] Plan folders for future uploaded loops, for example:
  - `web/audio/tabla/teentaal/`
  - `web/audio/tabla/keharwa/`
  - `web/audio/tabla/dadra/`
  - `web/audio/tabla/ektaal/`
  - `web/audio/tabla/rupak/`
- [ ] Include BPM metadata per loop when files are uploaded.
- [ ] Use BPM selector to choose closest available loop or apply modest playback-rate adjustment.
- [ ] Avoid extreme playback-rate changes that make tabla sound unnatural.

### Accompaniment controls

Recommended minimal v1.1 controls:

- [ ] Accompaniment off/on or grouped toggles.
- [ ] Tanpura toggle.
- [ ] Tanpura tuning selector: `Sa-Pa` / `Sa-ma`.
- [ ] Metronome toggle.
- [ ] Taal/cycle selector.
- [ ] BPM selector.
- [ ] Tabla toggle disabled until loops are uploaded, or hidden until ready.
- [ ] Optional volume controls only if layout remains clean.

## Website v1.1

Goal: `swarsaathi.com` should feel like a complete learner/product-forward website with partnerships as a secondary section.

Checklist:

- [ ] Rework `site/index.html` and `site/styles.css`.
- [ ] Make homepage primarily about SwarSaathi as a learner platform.
- [ ] Present SwarPractice as the first available product/tool.
- [ ] Present upcoming products/tools with brandable/non-obvious names or descriptive teasers rather than final generic names.
- [ ] Include accompaniment/practice, song pitch intelligence, and guided notation as future directions without overcommitting to final product names.
- [ ] Bucket business development and partner copy under Partnerships.
- [ ] Keep privacy/support pages working:
  - `https://swarsaathi.com/privacy.html`
  - `https://swarsaathi.com/support.html`
- [ ] Preserve App Store-safe privacy/support language.
- [ ] Add or confirm App Store / website cross-linking once app is live.

Suggested navigation direction:

- Home
- Products
- SwarPractice
- Roadmap or Coming Soon
- Partnerships
- Support

## App Store / metadata

Checklist:

- [ ] Confirm App Store Connect uses:
  - Marketing URL: `https://swarsaathi.com`
  - Support URL: `https://swarsaathi.com/support.html`
  - Privacy URL: `https://swarsaathi.com/privacy.html`
- [ ] Consider adding an in-app website link later, but App Store metadata is the main requirement for now.

## Implementation order when user says proceed

Recommended sequence:

1. **Planning/context pass**
   - Locate screenshots and tanpura files.
   - Inspect current wave/scoring/session layout code.

2. **Low-risk UI/pitch changes**
   - Rename `YOUR SA` to `YOUR PITCH`.
   - Tighten wave block spacing and post-session layout.

3. **Mic/wave/scoring engine changes**
   - Lower thresholds.
   - Split visual vs scoring streams.
   - Recalibrate scoring.
   - Update wave rendering bands.

4. **Accompaniment foundation**
   - Add tanpura asset manifest.
   - Add tanpura playback using uploaded real audio.
   - Add metronome with BPM and cycle accent.
   - Add tabla placeholders/manifest only.

5. **Website update**
   - Rework homepage structure/copy.
   - Keep partnerships secondary.
   - Preserve privacy/support pages.

6. **Verification**
   - Run existing pitch tests.
   - Run JS syntax checks.
   - Build/sync mobile bundle if app files changed.
   - Manual iPhone/web testing checklist.

## Future prompt to start implementation

Use this prompt when ready:

```text
Proceed with SwarSaathi/SwarPractice v1.1 from docs/V1_1-IMPLEMENTATION-PLAN.md. Implement the app/web pitch, wave, scoring, UI, tanpura, metronome, and website changes. Keep tabla disabled/placeheld until I upload tabla loops.
```
