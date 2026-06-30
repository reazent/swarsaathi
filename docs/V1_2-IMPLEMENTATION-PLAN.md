# SwarSaathi / SwarPractice v1.2 implementation plan

This document captures emerging v1.2 ideas. It is a planning checklist only; do not treat unchecked items as implemented.

## Release intent

v1.2 should build on the v1.1 launch by making accompaniment more production-ready, more efficient, and less dependent on network quality while keeping the app small enough for iOS and future Android distribution.

Initial focus:

- Offline-capable tanpura playback without bundling the full 1.5 GB source library.
- Automated audio preparation so tanpura loops do not need to be manually chopped.
- Preserve real recorded tanpura sound quality.
- Keep Cloudflare R2 as the master/fallback asset source.
- Leave room for additional v1.2 product inputs before implementation starts.

## Confirmed v1.2 decision: optimized offline tanpura

The current v1.1 design streams real tanpura MP3 files from:

```text
https://assets.swarsaathi.com/tanpura/...
```

That is acceptable for v1.1, but v1.2 should improve the experience:

- The app should work offline for supported tanpura pitches.
- The app should not bundle the full long-form tanpura recordings.
- Users should not have to manually download a pitch before basic use.
- Source tanpura files should remain long/high-quality master recordings.
- Code should generate compact production loops automatically.

## Proposed v1.2 tanpura architecture

### Master assets

Keep the existing long recordings as source/master files outside the shipped app bundle:

```text
web/audio/tanpura-master/
  Sa-Pa/
  Sa-ma/
```

or keep them in external storage/R2 and download only for asset preparation.

### Automated loop preparation

Add a script such as:

```text
scripts/prepare-tanpura-loops.mjs
```

The script should:

- Read long master tanpura recordings.
- Trim leading/trailing silence.
- Detect candidate repeating cycle regions.
- Choose a clean loop region with stable tone and no attack/transient artifacts.
- Apply a short crossfade at the seam to avoid clicks.
- Normalize perceived loudness across pitches/tunings.
- Export compact files, preferably AAC/M4A or efficient MP3.
- Generate a manifest used by the app.

Target output:

```text
web/audio/tanpura-optimized/
  Sa-Pa/C3.m4a
  Sa-Pa/C-sharp3.m4a
  Sa-ma/C3.m4a
  ...

web/audio/tanpura-optimized/manifest.json
```

### App playback

The app should prefer bundled optimized loops:

1. If an optimized offline loop exists for the selected pitch/tuning, play it locally.
2. If no bundled loop exists, fall back to R2 streaming only if allowed.
3. If neither exists, disable that pitch/tuning option so beginners do not hear the wrong tonic.

The v1.1 pitch availability behavior should remain: unsupported tanpura pitches must be disabled rather than silently mapped to a wrong pitch.

## Size target

Do not bundle the full tanpura library.

Target approximate bundle impact:

- Preferred: under 10 MB for common supported tanpura loops.
- Acceptable early v1.2 target: under 25 MB if coverage is wider.
- Avoid: hundreds of MB or full 1.5 GB master recordings.

Candidate encoding targets:

- 8-15 second clean loops.
- AAC/M4A or MP3 at roughly 64-96 kbps.
- Mono or stereo based on listening quality; test before choosing.

## Checklist

- [ ] Inventory all current tanpura master recordings and pitch/tuning coverage.
- [ ] Decide master asset location: local-only backup, R2 source bucket, or both.
- [ ] Add automated loop extraction script.
- [ ] Add seam/click detection or crossfade validation.
- [ ] Add loudness normalization across pitches.
- [ ] Export optimized loops into a separate app-bundled folder.
- [ ] Generate a manifest with pitch, tuning, file path, duration, encoding, and source hash.
- [ ] Update `web/scripts/build-mobile.mjs` to bundle optimized tanpura loops but continue excluding master recordings.
- [ ] Update `web/js/milap.js` to prefer local optimized loops and fall back to R2.
- [ ] Keep unsupported pitch options disabled when no correct loop exists.
- [ ] Test offline on iPhone with airplane mode enabled.
- [ ] Test future Android behavior with network disabled.
- [ ] Compare loop quality against v1.1 streamed masters and iTablaPro-style expectations.

## Open questions for v1.2

- Which pitches should be bundled by default for offline use?
- Should both `Sa-Pa` and `Sa-ma` be bundled for every supported pitch, or should v1.2 start with one tuning?
- Should offline tanpura be available to all users or reserved for a future paid/pro tier?
- Should R2 streaming remain available for less common pitches?
- What maximum app download size is acceptable for iOS and Android?
- Should tabla follow the same optimized-loop pipeline once real tabla loops are ready?

## Future prompt to start implementation

Use this prompt when ready:

```text
Proceed with SwarSaathi/SwarPractice v1.2 from docs/V1_2-IMPLEMENTATION-PLAN.md. Start with the automated optimized offline tanpura loop pipeline. Do not manually chop audio files; create a repeatable script and keep full master recordings out of the shipped app bundle.
```
