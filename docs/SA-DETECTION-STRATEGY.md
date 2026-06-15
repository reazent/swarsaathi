# Sa detection strategy

How **Shruti** finds the **Sa (pitch)** of an Indian film song's official studio recording, expressed as a Western note name (e.g. D3, A3).

This is the design spec for the analysis engine. Engineering details (libraries, code) live in `app/services/`.

---

## 1. Foundational principles

These come from how Indian music actually works, and they shape the whole engine.

1. **Sa is a movable tonic, fixed per recording.** A singer can choose any Sa, but once chosen for a recording, it is fixed for that master. Our job: identify *which* note Sa is, for *that* recording.

2. **Within one performance, all pitched instruments share the same Sa.** Harmonium, tanpura, guitar, sitar, piano, bass, strings — once Sa is set, they all align to it. So multiple sources in the mix encode the *same* tonic.

3. **Every note sits on one movable-Sa grid.** All 12 swaras — shuddha, komal (flat), tivra (sharp) — are defined relative to Sa. This is true for **sargam passages and ordinary lyric notes alike**. So the entire melody collectively constrains Sa.

4. **Sa is a pitch class, performed across octaves.** Lower/middle/upper Sa are the same answer. A song "in C" has every Sa = C regardless of octave. → **Fold all detected notes to pitch class** when solving for Sa.

5. **Sargam is self-labeling.** When a singer sings note-names (Sa, Re, Ga…), those syllables are voiced **at the song's actual pitch**. The intervals between them are fixed, so even a sargam *without* Sa pins down Sa. This makes sargam songs near-ground-truth.

6. **Sa lives in a constrained frequency band.** Almost all Indian film song Sa values fall in **G2 (98 Hz) → B3 (246.94 Hz)**. This converts open-ended pitch estimation into **classification over a small, known set of target frequencies** and eliminates most octave errors.

---

## 2. The Sa frequency constraint (G2 → B3)

Equal temperament, A4 = 440 Hz. 17 candidate semitones:

| Note | Hz | Note | Hz | Note | Hz |
|------|------|------|------|------|------|
| G2 | 98.00 | C3 | 130.81 | F#3/G♭3 | 185.00 |
| G#2/A♭2 | 103.83 | C#3/D♭3 | 138.59 | G3 | 196.00 |
| A2 | 110.00 | D3 | 146.83 | G#3/A♭3 | 207.65 |
| A#2/B♭2 | 116.54 | D#3/E♭3 | 155.56 | A3 | 220.00 |
| B2 | 123.47 | E3 | 164.81 | A#3/B♭3 | 233.08 |
| | | F3 | 174.61 | B3 | 246.94 |

### Typical clustering (prior, not a hard rule)

| Group | Range | Most common Sa |
|-------|-------|----------------|
| Low male (rare) | G2–B2 (98–123 Hz) | — few examples, real |
| Common male | C3–E3 (131–165 Hz) | C#3/D♭3 (138.59), D3 (146.83) |
| Duets / mixed | E3–G3 (165–196 Hz) | F#3/G♭3 (185.00) |
| Female | G3–B3 (196–247 Hz) | G#3/A♭3 (207.65), A3 (220.00) |

### Octave ambiguity (the only tricky part)

The band spans ~1.5 octaves, so some pitch classes appear twice:

- **Two octave candidates** (need tie-breaker): **G, G#, A, A#, B** (octave 2 vs 3)
- **Single candidate** (snap cleanly): **C, C#, D, D#, E, F, F#** (octave 3 only)

**Resolution order for the five ambiguous classes:**

1. **Measured fundamental (Hz)** — primary. Snap the detected tonic to the nearest of the 17 targets. A 98 Hz Sa → G2; a 196 Hz Sa → G3. No forcing.
2. **Rarity prior** — octave-2 G/G#/A region is rare, so default to octave 3 unless the measured Hz clearly says octave 2.
3. **Vocal register** — deep male lead → favor octave 2; female lead → octave 3.

> Edge case: a handful of very deep songs may touch G2/G#2. The band floor covers them. If a verified example ever falls below G2, extend the table down a semitone.

---

## 3. Detection pipeline (per recording)

```
Audio (official master)
  │
  1. CONSTRAIN  → search only within G2–B3 (17 targets)
  │
  2. GATHER EVIDENCE (multiple "voters")
  │     • Full-mix chroma (always available)
  │     • Vocal line — resting / phrase-ending notes (primary in film music)
  │     • Bass line — root at cadences
  │     • Sargam passage — when present (highest confidence)
  │
  3. FIT  → fold all notes to pitch class, solve for the single Sa
  │         offset that best explains all sources together
  │
  4. SNAP  → map winning pitch class into G2–B3 via nearest measured Hz
  │
  5. SCORE → confidence = agreement across voters
  │
  6. OUTPUT → Sa note + Hz + confidence  (e.g. "D3 · 146.83 Hz · high")
  │
  7. CACHE → store by track ID (ISRC) for instant repeat lookups
```

### Notes per stage

- **Constrain first.** This is the highest-leverage step — it removes octave-halving/doubling errors before they occur.
- **Skip the drums/percussion stem for pitch.** Tabla has no stable tonal pitch; it only adds noise.
- **Weight voters by stability.** Bass and sustained/drone-like tones are steadier than lyric vocals (which glide via meend/ornaments). Trust stable sources more.
- **Film music reality:** most film songs have **no constant drone** and have real orchestration / chord changes / occasional modulation. So the **vocal resting note + bass root agreement** is the core signal; full-mix chroma is a third vote, not the sole basis.
- **Modulation:** analyze mukhda (sthayi) and antara separately; if they differ, report the **primary Sa** (usually mukhda), not an average.
- **Segment selection:** prefer sustained vocal/instrumental sections over busy intros for a cleaner read.

---

## 4. Sargam handling (special high-confidence path)

If-then logic:

```
if song contains a detectable sargam:
    read Sa directly from the sung note-names (fit intervals → solve Sa)
else:
    use the multi-source voting pipeline (and model in later versions)
```

- Sargam notes can **repeat** and span **any octave** — fold to pitch class and read the sargam **in totality**.
- A sargam **need not contain Sa** — other notes still pin it down via fixed intervals.
- **Built-in verification:** detected intervals must match theoretical sargam intervals (e.g. Sa→Pa = perfect fifth). If they do, the reading is self-confirming.
- **Caveat:** correctly identifying *which* syllable is which (and komal/tivra variants) needs lyric alignment or vocal syllable recognition — powerful but not free.
- **Primary value:** sargam songs **auto-label themselves** → cheap, high-quality training data.

---

## 5. Confidence & ground truth

- **Confidence = cross-source agreement.** All voters converge → auto-accept and display. Voters split → low-confidence flag → human review queue.
- **Verified human labels are the trust layer**, especially early. The verified database *is* the product before the model is mature. (Maintained in `labels.xlsx` → `labels.csv`.)
- **Verified labels override analysis** on lookup (confidence = 1.0).

---

## 6. The model (later versions)

- Trained on accumulated labels: **human-verified + sargam-auto-labeled**.
- Becomes **one more voter / tie-breaker**, not a from-scratch oracle.
- Inputs: features from separated stems + chroma, constrained to G2–B3.
- Target: Sa pitch class (then snapped to band).
- See `docs/MODELS.md` for which models we use vs train (Demucs/RoFormer for separation — pre-trained; Sa classifier — trained by us; chroma/Krumhansl baseline).

### Separation choice

- **Demucs (htdemucs):** easiest to script, 4 stems (vocals/drums/bass/other). Note: a tanpura/harmonium drone lands inside "other," not a clean stem.
- **BS-RoFormer / Mel-Band RoFormer (via UVR), MDX23:** cleaner, current state-of-the-art; preferred when separation quality matters.
- **Opinion:** don't lead with heavy separation/ML. Constraint + chroma + vocal/bass agreement gets far at low cost. Separation and the model are **accuracy multipliers for v2/v3**.

---

## 7. Phased build

| Phase | Ships | Cost |
|-------|-------|------|
| **v1 (now)** | Constrained chroma + band-snapping + verified human labels → instant lookups for known songs | Low (mostly built) |
| **v2** | Stem separation (vocal + bass agreement), sargam auto-labeling, confidence scoring | Medium |
| **v3** | Trained Sa model as additional voter; scale coverage via licensed catalog | Higher |

**Priorities:** invest early in the **verified-label database** and the **confidence score** — they give a trustworthy product today and the training data for tomorrow. **Sargam auto-labeling** is the highest-leverage research bet.

---

## 8. Output contract

For each track the engine returns:

```json
{
  "track_id": "…",
  "sa_note": "D3",
  "sa_frequency_hz": 146.83,
  "confidence": 0.0,
  "source": "labels | sargam | voting | model",
  "from_label": false
}
```

User-facing: show **Pitch** prominently (the note), note it is the song's **Sa / home note**, and a plain tuning tip. Hide technical fields (confidence, source, Hz precision) from the casual user; keep them in the API for QA.

---

## 9. One-line summary

Constrain Sa to the **G2→B3** band, let multiple in-mix sources **vote onto one Sa grid**, snap to the **nearest real frequency**, ship a **confidence score**, lean on **verified + sargam-derived labels** for trust and training, and add **separation/ML only to scale accuracy**.
