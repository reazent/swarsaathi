# Tanpura — why it was removed & how to bring it back properly

## Why iTablaPro / iShala sound real (and ours didn't)

| What pro apps do | What we tried |
|------------------|---------------|
| **Studio-recorded** tanpura, often uncompressed WAV | Freesound MP3 preview loop |
| **Per-string pluck samples** (Pa, Sa, Sa, mandra Sa) triggered on a **cycle** | One stereo mix looped continuously |
| **Staggered plucks** every ~1–3 s per string — the characteristic texture | No pluck rhythm |
| **Pitch** via sample sets per key or careful time-stretch, not naive `playbackRate` on a full mix | Single loop pitch-shifted — kills jawari/overtones |
| Multiple **tanpura flavours** (Pa-Sa-Sa-sa, Ma-Sa-Sa-sa, etc.) | One generic drone |
| Per-string **volume** and tuning | N/A |

Sources: [iTablaPro](https://itablapro.app/), [iTabla Pandit manual](https://studio.itabla.com/user-manual/Tanpura.html), [iTabla FAQ](https://studio.itabla.com/faq.html).

**Conclusion:** A loop + playbackRate cannot replicate a tanpura. Synthesized oscillators were worse. We **removed tanpura from Raag** (Jun 2026) rather than ship something that undermines trust.

**For now:** use **iTablaPro**, **iShala**, or **iTabla Pandit** for tanpura; Shruti Raag provides **tabla + matra display**. Match **Reference pitch (Sa)** in Raag to your tanpura app.

---

## What we need before re-adding tanpura

1. **License studio samples** — record or buy (e.g. Miraj tanpura, Pete Lockett kit, commercial library).
2. **Per-string pluck WAVs** — at minimum 3–4 strings for Pa-Sa-Sa-sa tuning.
3. **Pluck scheduler** — trigger strings in rotation with configurable gap (like iTabla Pandit).
4. **Pitch** — either one sample set per semitone (G2–D4) or high-quality time-stretch per string (not one mixed loop).
5. **Optional:** shruti-box / sur-peti as separate product (Pro).

Estimated effort: **medium–large** (audio asset pipeline + engine). Tabla path proves Web Audio sample playback works; tanpura needs a **different architecture**.

---

## Shruti differentiation (unchanged)

When tanpura returns, Shruti still wins on **Pitch Finder → practice in song's pitch**, **Discover**, and **Riyaz** — not on cloning iTablaPro's full classical studio.
