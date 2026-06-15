# Build log

Quick reference for what's done and what's pending — newest first.
No scrolling through chat needed.

---

## 2026-06-15 — Monetization gating (free vs Pro) + infra plan

### What I built (server-side enforced, UI reflects it)
- **`app/services/entitlements.py`** — single source of truth for tiers + perks.
- **`app/services/usage.py`** + **`UsageCounter`** model — DB-backed daily quota
  (Redis-swappable via identical signatures).
- **`app/api/deps.py`** — `get_client_id` (`X-Client-Id` header) + `resolve_tier`
  (manual `PRO_CLIENT_IDS`; dev `X-Shruti-Tier` override). The Auth/RevenueCat seam.
- **`GET /api/v1/me`** — tier, entitlements, remaining free lookups.
- **`POST /tracks/{id}/analyze`** — meters **fresh** analyses only; **HTTP 402**
  `{error: quota_exceeded, upgrade: true}` on limit. Cached pitches + `GET /pitch`
  stay free & unlimited (`needs_fresh_analysis` mirrors the cache logic).
- **Frontend:** `account.js` (Free/Pro chip + remaining lookups, sidebar on
  desktop / top bar on mobile), upgrade modal, `X-Client-Id` on every request,
  402 → modal, quota chip refresh after each analysis.

### Verified
- `/me` free vs dev-pro override (entitlements differ correctly).
- Free at limit + fresh analyze → **402**; Pro override → 200 (Sa computed).
- Browser e2e: at-limit free client clicking an unanalyzed song → upgrade modal.
- Cleaned test usage counters afterwards (fresh quota for real testing).

### Config / docs
- `config.py`: `free_daily_analyses` (5), `pro_client_ids`, `is_dev` helper.
- `docs/MONETIZATION-AND-INFRA.md` (strategy + what's done + roadmap),
  `docs/CLOUD-SETUP.md` (ordered free-tier signup checklist), expanded `.env.example`.

### Roadmap (unchanged plan)
Auth (Supabase/Clerk) → RevenueCat+Stripe billing → Redis quota → gate each new
product's advanced features by adding entitlement keys in one place.

---

## 2026-06-15 — Riyaz (real-time swara tuner) — third product

### What I built
- **`web/js/riyaz.js`** (new) — fully client-side, no backend, no audio leaves the device.
  - Mic capture via Web Audio (`getUserMedia` with echo-cancel / noise-suppress / AGC **off** for accurate pitch).
  - **Pitch detection**: autocorrelation + parabolic interpolation (vocal range 70–1100 Hz), EMA smoothing to kill jitter.
  - **Swara mapping**: `frequencyToSwara(freq, saMidi)` → swara, octave (mandra/madhya/taar), cents off, Western note. Verified against test cases (D#3→komal Ga, G3→Pa, C4→Sa taar, C2→Sa mandra, A4→Dha taar).
  - **Notation**: Bhatkhande — komal swaras (re, ga, dha, ni) drawn with an underline below the letter; tivra Ma with a vertical line above. CSS pseudo-elements (`.swara-mark.komal::after` / `.tivra::before`) so it scales with font size in both the big readout and the scale strip.
  - **Strictness**: Beginner ±35¢ / Intermediate ±20¢ / Expert ±10¢ — sets the green in-tune zone + sustain target.
  - **Sa drone**: Sa–Pa–Sa reference (triangle oscillators, soft gain ramp); retunes live when Sa changes. Hint to use headphones so it doesn't bleed into detection.
- **UI** (`index.html` + `styles.css`): Sa picker (G2–D4), strictness segmented control, mic toggle, big colour-graded swara readout, ±50¢ needle meter (hue green→red by deviation), **sustain ring** that fills while you hold in tune (gamifies steady sur), and a 12-swara scale strip highlighting the current note.
- **Router** (`app.js`): added `riyaz` view; **frees the mic + stops the drone when you leave the tool**.

### Verified in browser
- Swara math correct across octaves & komal/tivra (via console).
- Full tuner renders: green "Ga", needle at +6¢ "in tune", sustain ring filling, scale strip highlight. Mobile layout stacks cleanly.
- Mic capture itself can't run in the automation sandbox (no audio input/permission), but the detect→map→render pipeline is verified end-to-end with injected frequencies.

### Ideas parked for later
- Tanpura (plucked 4-string cycle) upgrade of the drone; record/playback a riyaz session; target-swara drills with scoring.

---

## 2026-06-15 — Discovery engine + multi-tool app shell

### What I built
- **Backend**
  - `app/db/models.py` — `Track` gained facet columns: `artists`, `music_director`, `writers`, `genre`, `label`, `track_no` (plus existing `isrc`).
  - `app/services/catalog_import.py` — loads all facets from `labels.xlsx`; search blob now includes music director, writers, genre, label.
  - `app/services/discovery.py` (new) — `discover()` ANDs structured filters (text, singer, music director, writer, genre, label, decade/year range, Sa pitch, has-pitch, verified-only) over a `Track`⟕`PitchResult` join; `list_facets()` returns distinct dropdown values + decades + known pitches.
  - `app/api/routes.py` + `app/schemas.py` — `GET /api/v1/discover` and `GET /api/v1/facets`.
- **Frontend — reorganised into a product shell (the "full-stack music app" vision)**
  - `web/index.html` — sidebar nav + view router; two tools today: **Pitch Finder** and **Discover**. Mobile bottom-tab bar; responsive.
  - `web/js/` — `app.js` (router + cross-tool actions), `pitch.js` (search → Sa), `discover.js` (faceted browse), `shared.js` (artwork gradients, fetch helpers).
  - `web/styles.css` — full app-shell styling; Discover cards show a pitch badge once Sa is known. Clicking a Discover card jumps to Pitch Finder and analyses it.
  - **API-first** so future iOS / Android / Windows apps reuse the same `/api/v1` endpoints.

### Verified in browser
- Facets populate from real tags; `Music director = R.D. Burman` narrows 6 → 3 songs.
- Search → select → analyse works (e.g. *Jalte Hain Jiske Liye* → **C#**); loading status hides correctly.

### Fixed
- `[hidden]` was overridden by `.status { display:flex }` → added global `[hidden]{display:none!important}`.
- Suggestions dropdown was covered by the welcome panel (sibling `backdrop-filter` stacking contexts) → lifted `.search-panel` with `z-index`.

### Pending
- Pitch filter is empty until verified `sa_note` labels exist — it auto-populates from `PitchResult` once you sync labels.

---

## 2026-06-14 — Metadata facets in labels (auto, no manual faceting)

### What I built
- **`scripts/fill_labels_from_audio.py`** — now extracts every auto-derivable facet from audio tags: `artists`, `music_director` (`aART`), `writers` (`©wrt`), `genre`, `label` (from `©cprt`), `isrc` (from `xid`), `track_no`. Added `parse_label`, `parse_isrc`, `extract_facets`.
- **`labels.xlsx`** — migrated 9 → 16 columns; backfilled all 6 audio rows from their tags; **preserved** existing `sa_note`/`verified`/`notes`. Example row (no audio) left blank in facet columns.
- **`scripts/sync_labels_from_excel.py`** — CSV now carries the facet columns; tolerates older sheets missing them.
- **`LABELS.md`** — documents auto vs manual columns.

### Notes
- Facets are **metadata-only** by design (user wants zero manual faceting). Solo/duet, language, gender are NOT captured — they aren't reliable in tags.
- These facets power the planned **discovery query engine** ("Rafi · R.D. Burman · 1960s · D pitch").
- ISRC is now captured per track — the stable global ID for future B2B catalog matching.

### Pending (the discovery engine itself)
- Extend `Track` model + `catalog_import.py` to load facets, add `/api/v1/discover` faceted endpoint + filter UI. Pitch-based filters depend on labeled/analyzed Sa.

---

## 2026-06-14 — Sa constraint engine (deterministic core)

### What I built
- **`app/services/sa_constraint.py`** — the constraint table + snapping math
  - 17-target frequency table, **G2 (98.00 Hz) → B3 (246.94 Hz)**
  - `snap_frequency(hz)` — nearest-target snap; in-band trusts octave, out-of-band recovers pitch class + rarity prior (fixes detector octave errors)
  - `resolve_pitch_class(pc, measured_hz, prefer_lower_octave)` — resolves the 5 ambiguous classes (G, G#, A, A#, B) via measured Hz → register → rarity prior
  - helpers: `cents_between`, `pitch_class_of`, `in_band`
- **`app/services/pitch_analysis.py`** — `analyze_sa` now also returns `sa_note_full` (e.g. `A3`), `sa_frequency_hz` (220.0), `resolved_by`. A `measured_hz=None` hook is in place for the future fundamental estimator.
- **`tests/test_sa_constraint.py`** — 13 deterministic tests, **all passing** (`python tests/test_sa_constraint.py`)

### What's deliberately left for validation (needs verified labels)
- **Measured-Hz fundamental estimator** — extracting the real Sa frequency from audio; its accuracy must be tuned against verified labels, so the `measured_hz` hook is `None` for now (ambiguous octaves use the rarity prior until then).
- **Surfacing frequency + octave in API / DB / UI** — pairs with the validation pass; avoids a premature DB migration.

### To resume
1. Finish `sa_note` + `verified` in `labels.xlsx`, then `python3 scripts/sync_labels_from_excel.py`
2. Ping: "labels are ready" → I plug in the fundamental estimator, validate against ground truth, and surface richer output to the UI.

---

## Next product ideas (full-stack music app)

Candidates that reuse the existing stack with minimal new code (see chat for rationale). Top pick: **Tanpura / Shruti drone tuned to the detected Sa**.
