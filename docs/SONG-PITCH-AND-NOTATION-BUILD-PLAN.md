# SwarSaathi song pitch and notation build plan

## Vision

SwarSaathi should become a one-stop learning companion for Indian music learners and enthusiasts. The song tools should help a learner move from a familiar film song to practical musicianship:

1. Find the official recording.
2. Identify the song's Sa / home pitch accurately.
3. Understand the notes, taal, and expression.
4. Practice the song with or without tanpura, tabla, harmonium, or karaoke backing.

This plan separates the work into two major builds:

- **Song Pitch Finder:** official song audio -> Sa / home pitch.
- **Song Notation Generator:** official song audio + Sa -> swara notation, rhythm/taal hints, and eventually karaoke/practice support.

Pitch Finder should ship first. Notation depends on the pitch result and is substantially harder.

## Current State

The repository already has the foundation for Pitch Finder:

- Search/catalog records in `Track`.
- Cached pitch records in `PitchResult`.
- API endpoints for search, discover, pitch lookup, and analysis.
- Label workflow via `labels.xlsx` -> `labels.csv`.
- A baseline analyzer in `app/services/pitch_analysis.py`.
- Sa constraint logic in `app/services/sa_constraint.py`.
- Product strategy in `docs/SA-DETECTION-STRATEGY.md`.

The current analyzer is useful as a baseline, not as the final quality bar. It uses full-mix chroma plus Western key profiles, then snaps the pitch class into the Indian film-song Sa band. That is efficient, but it can confuse Western harmonic key with Indian tonic and cannot be considered flawless on mixed film audio.

## Core Principle

The app must not publish uncertain guesses as facts.

The quality target should be:

- **High-confidence automatic results:** show directly.
- **Medium/low-confidence results:** send to review queue.
- **Human verified results:** always override analysis.

This gives users a flawless experience even while the model improves: uncertainty is handled internally, not exposed as a wrong result.

## Pitch Finder Architecture

### Product path update: listen-first, partner-backed later

Because direct licensing from streaming platforms and labels may take a long time, the scalable near-term product path is **device/browser-side listening analysis** rather than a manually labeled database. The product should estimate the Sa of the original recording by listening to user-controlled playback through the microphone.

Near-term user flow:

1. User searches/selects film song metadata.
2. App asks the user to play 20-30 seconds of the original recording from any lawful source.
3. SwarSaathi listens through the device microphone.
4. The local analyzer estimates the song's Sa with confidence.
5. User can open SwarPractice at that pitch.
6. Optionally save only derived metadata such as Sa, confidence, source note, and timestamp; do not store copyrighted audio.

Parallel long-term path:

- Continue B2B audio/catalog partner outreach for licensed server-side analysis of official audio.
- The partner path should eventually replace or augment mic-listening with higher-quality official-audio analysis.
- Desired partner rights remain: song search, stable IDs, analysis of official recordings, and storage of derived non-audio results such as Sa/confidence.

Nice-to-have later:

- User-provided local file analysis for files the user has the right to analyze.
- This should be framed as local/transient analysis and should not require storing audio.

YouTube / embedded playback policy:

- YouTube may be useful as a discovery or playback aid through the official player.
- Do **not** make direct YouTube tab/audio capture the core path without legal review or explicit permission.
- YouTube API/embedded-player policies restrict separating, isolating, modifying, or promoting audio separately from video.
- Sa detection from YouTube should therefore be framed as microphone listening to user-controlled playback, not programmatic extraction of YouTube audio.

### Input

Supported input modes, in priority order for build planning:

1. **Listen mode (near-term scalable path):** microphone captures user-controlled playback of the original recording from speaker/another device/same environment. Audio is analyzed locally/transiently; store derived Sa only.
2. **Partner mode (long-term ideal path):** licensed server-side analysis of official audio from a catalog/audio partner.
3. **Local file mode (nice-to-have):** user provides a file they have the right to analyze; analyze locally/transiently.

Preferred canonical metadata:

- Stable track ID where available, ideally ISRC.
- Official recording metadata: title, film, singer, year, label, music director.
- Source note, for example user-selected metadata result or playback source.

For development, local purchased/reference audio in `audio/` is enough. For production partner mode, server-side analysis of official audio needs explicit licensing rights. For listen mode, the product should avoid storing copyrighted audio and should present the result as an estimate from listened playback.

### Candidate Space

Keep the existing constraint:

- Candidate Sa values: **G2 -> B3**.
- 17 semitone candidates.
- Fold evidence to pitch class where needed.
- Use measured fundamental to resolve G/G#/A/A#/B octave ambiguity.

This constraint is one of the biggest accuracy advantages of the product because Indian film song Sa lives in a smaller range than arbitrary audio key detection.

### Analysis Pipeline v2

Build `sa-v2-voting` as the next engine.

```text
Official audio
  -> decode/normalize
  -> segment into useful song regions
  -> extract evidence voters
  -> score 17 Sa candidates
  -> confidence calibration
  -> cache result or review
```

Evidence voters:

1. **Full-mix chroma / HPCP voter**
   - Improved version of the current baseline.
   - Uses CQT/HPCP over selected stable segments.
   - Scores all 17 candidate Sa targets, not generic Western major/minor key only.

2. **Vocal melody voter**
   - Extract predominant vocal F0 from likely vocal sections.
   - Fold melody notes relative to each candidate Sa.
   - Weight phrase-ending/resting notes higher than ornamental passing notes.
   - This is the most important film-song voter.

3. **Bass/root voter**
   - Analyze low-frequency root motion, especially near cadences.
   - Useful because bass often confirms tonal center.

4. **Sustained/drone/instrumental resonance voter**
   - Detect stable long tones from harmonium, strings, tanpura-like pads, or synth drones when present.
   - Not always available in film songs, but high value when present.

5. **Section agreement voter**
   - Analyze mukhda and antara separately.
   - If they agree, confidence increases.
   - If they differ, flag possible modulation or noisy evidence.

6. **Human/register prior**
   - Singer/register can help resolve octave ambiguity only after measured evidence.
   - Never let the prior override strong frequency evidence.

### Confidence

Confidence should not be a raw model score. It should be an operational trust score:

- Agreement across independent voters.
- Margin between the top two candidates.
- Stability across sections.
- Distance from nearest constrained Sa frequency.
- Whether a verified human label exists.

Suggested bands:

- `>= 0.90`: auto-publish.
- `0.75 - 0.89`: show internally as likely, review before public catalog.
- `< 0.75`: review required.

### Caching

Caching means: analyze a song once, store the result, and return it instantly next time.

Cache key order:

1. ISRC if available.
2. Partner track ID.
3. Audio fingerprint if available.
4. Internal `track_id` as fallback.

Cache stored fields:

- `sa_note_full`, e.g. `D3`.
- `sa_pitch_class`, e.g. `D`.
- `sa_frequency_hz`.
- `confidence`.
- `analysis_version`.
- `source`: `verified_label | sa-v2-voting | model | review`.
- `evidence_json`: top candidates, voter scores, section scores.
- `analyzed_at`.

## Backend Build Plan

### Phase 1: Benchmark And Review Foundation

Goal: know whether the engine is right before scaling it.

Tasks:

- Expand schema for full note + frequency + evidence JSON.
- Add a benchmark runner: `labels.csv` + audio -> predictions -> accuracy report.
- Add a small review workflow for low-confidence results.
- Create a pilot set of 50-100 official songs with human Sa labels.
- Track metrics by singer type, decade, orchestration, and label/source.

Success criteria:

- Exact Sa pitch-class accuracy measured against human labels.
- Octave resolution accuracy measured for G/G#/A/A#/B cases.
- Confidence calibration: high confidence should almost never be wrong.

### Phase 2: `sa-v2-voting`

Goal: move beyond the current chroma-only baseline.

Tasks:

- Replace generic major/minor key profile with Sa-candidate scoring.
- Add segment selection and section-level analysis.
- Add vocal F0 extraction.
- Add bass/root evidence.
- Add confidence aggregation.
- Persist evidence for review/debugging.

Technology choices:

- Start CPU-first with `librosa`, `numpy`, `scipy`, and `soundfile`.
- Use `librosa.pyin` or a comparable F0 extractor for an initial vocal melody voter.
- Add source separation only when benchmark results justify the cost.
- For separation, test Demucs first because it is scriptable and proven; evaluate RoFormer/UVR later if needed.

### Phase 3: Search + Async Jobs

Goal: user searches a song and gets instant cached pitch or a background analysis state.

Tasks:

- Add analysis status: `not_analyzed | queued | analyzing | ready | review_required | failed`.
- Add a background job queue.
- Add result polling or push notification in the UI.
- Make cached results free/instant.
- Meter only fresh analyses.

Suggested stack:

- Postgres for catalog/results.
- Redis/Upstash for queue/rate state.
- R2/S3-compatible storage for licensed audio and feature artifacts.
- Cloud Run/Fly for API.
- Modal/Replicate only if GPU separation becomes necessary.

### Phase 4: Model-Assisted Pitch

Goal: add ML as one voter, not as an unexplainable oracle.

Training data:

- Human verified labels.
- High-confidence sargam-derived labels.
- Engine predictions reviewed by humans.

Model:

- 12-class Sa pitch-class classifier plus octave resolver.
- Inputs from chroma/HPCP, melody histogram, bass histogram, section features.
- Output joins the voting system as an additional voter.

## Notation Generator Architecture

Notation generation should begin after Pitch Finder v2 is benchmarked.

### Input

- Official audio.
- Verified or high-confidence Sa.
- Optional lyrics/section metadata later.

### Output v1

- Mukhda/antara phrase-level swara notation.
- Mandra/Madhya/Taar markers.
- Komal/tivra notation.
- Approximate rhythm/duration.
- Confidence per phrase.
- Human-editable draft.

### Pipeline

```text
Official audio
  -> vocal separation
  -> melody F0 extraction
  -> note segmentation
  -> map notes to swaras relative to Sa
  -> detect phrase boundaries
  -> estimate beat/taal grid
  -> produce editable notation draft
```

Important reality:

- Indian film vocals use meend, murki, slides, vibrato, and expressive pitch movement.
- A raw pitch track is not the same as useful notation.
- Auto-notation should be treated as a draft until reviewed.

### Notation Quality Rules

- Quantize only stable note regions.
- Preserve important glides as annotations rather than forcing every frame into a swara.
- Use confidence per note/phrase.
- Prefer clean, useful learner notation over excessive micro-detail.

### Taal And Rhythm

Taal detection is separate from swara detection.

Initial approach:

- Estimate beat and tempo.
- Detect repeating cycle candidates.
- Let a human set or correct taal/sam when uncertain.

Later:

- Build a taal classifier from labeled examples.
- Support practice playback with tabla/harmonium once licensing and audio quality are ready.

## Legal And Licensing Constraints

Pitch lookup and notation are not equal legally.

Pitch result:

- A derived fact about the recording.
- Still should be generated from legally accessed audio.

Notation:

- Much closer to a derivative musical work.
- Needs stronger rights review before public distribution at scale.

Karaoke/backing track:

- Requires explicit playback and pitch-shifting rights.
- Do not build public karaoke features until rights are clear.

Immediate safe path:

- Use local/purchased audio for internal development and benchmarking.
- Publish only pitch results and metadata where rights permit.
- Keep notation generation as internal drafts until licensing is resolved.

## Immediate Next Sprint

1. Add data model fields for full Sa note, frequency, analysis source, status, and evidence JSON.
2. Add benchmark runner against `labels.csv`.
3. Build `sa-v2-voting` skeleton with candidate scoring.
4. Add first improved full-mix Sa-candidate scorer.
5. Add review report: top 3 candidates, confidence, and evidence summary.
6. Run against a 25-song pilot set.
7. Compare against human labels and improve.

## What The User Needs To Provide

For a serious pitch engine:

1. **Pilot song set**
   - 25 official recordings to start; 50-100 soon after.
   - Prefer legally purchased or otherwise licensed files for development.
   - Put files in `audio/`.

2. **Human ground truth**
   - For each pilot song, manually verify Sa on harmonium/keyboard.
   - Enter `sa_note` and `verified=true` in `labels.xlsx`.

3. **Catalog priority**
   - Decide first target catalog: Hindi film classics, modern Bollywood, devotional, regional film, or a mixed benchmark.

4. **Licensing direction**
   - For production analysis, pursue B2B catalog/audio rights.
   - Ask specifically for server-side analysis, cached derived pitch, and future notation/practice rights.

5. **Quality bar**
   - Decide whether public lookup should show only verified/high-confidence results initially. Recommended: yes.

## Recommendation

Build Pitch Finder first as a high-trust system:

- Search experience can be product-polished early.
- Engine output should be hidden behind confidence and review.
- Human verified labels are not a compromise; they are the ground truth layer.
- The automated engine should earn the right to publish by matching that ground truth.

Build Notation second:

- It depends on accurate Sa.
- It is harder musically and legally.
- It should start as an editable draft tool, then graduate to public learner notation after review.
