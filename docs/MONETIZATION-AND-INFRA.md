# Monetization & Infrastructure

Strategy + what's implemented + the roadmap. Companion to `docs/CLOUD-SETUP.md`
(the step-by-step signup checklist).

---

## 1. Monetization

### Principle
Be generous with **zero-marginal-cost** features (drive habit + word of mouth);
**meter the features that cost real money**. A computed Sa is cached forever, so
cached lookups are free to serve for everyone — only *fresh* analysis costs.

### Cost profile per product
| Product | Marginal cost | Stance |
|---------|---------------|--------|
| **Riyaz** (tuner) | ~0 (on-device) | Core fully free — the daily-habit hook |
| **Discover** | tiny (metadata query) | Free; great for SEO/acquisition |
| **Pitch Finder** | real (compute + licensed audio) on *fresh* analysis | Metered for free tier |

### Free vs Pro (current entitlements — see `app/services/entitlements.py`)
| Entitlement | Free | Pro |
|-------------|------|-----|
| `fresh_analyses_per_day` | 5 | unlimited |
| `upload_analysis` (analyze your own recording) | ✗ | ✓ |
| `pitch_details` (alt Sa, transpose, harmonium) | ✗ | ✓ |
| `saved_lists` (Discover save/export) | ✗ | ✓ |
| `riyaz_core` | ✓ | ✓ |
| `riyaz_recording` / `riyaz_drills` / `riyaz_progress` | ✗ | ✓ |
| `drone_styles` | basic | basic + tanpura + shruti-box |
| `ads` | shown | none |
| `offline` | ✗ | ✓ |

Model: **subscription** (ongoing server + licensing costs rule out one-time
unlock). Use **regional/PPP pricing** — critical for the India-first audience.

### What's implemented now
- **Server-side enforcement** (clients get cracked, so never gate only in UI):
  - `GET /api/v1/me` → tier, entitlements, remaining free lookups.
  - `POST /tracks/{id}/analyze` charges quota **only for fresh analyses**; returns
    **HTTP 402** `{error: "quota_exceeded", upgrade: true}` when the free daily
    limit is hit. Cached/known pitches and `GET /pitch` are always free.
  - Daily quota is **DB-backed** (`usage_counters` table) so it survives restarts.
- **Identity (pre-auth):** an `X-Client-Id` header the frontend generates and
  stores in `localStorage`. Quota is keyed on it.
- **Tier resolution** (`app/api/deps.py`): manual Pro allow-list via
  `PRO_CLIENT_IDS`; in dev, an `X-SwarSaathi-Tier: pro|free` header override for testing.
- **Frontend:** Free/Pro chip + remaining-lookups in the sidebar (top bar on
  mobile); 402 opens an upgrade modal; quota chip refreshes after each analysis.

### Roadmap (wire as we grow / add products)
1. **Auth** (Supabase Auth or Clerk) → replace `X-Client-Id` with a real user id.
2. **Billing** via **RevenueCat** (unifies App Store + Play + Stripe-web). A
   webhook updates a `users.tier` row; `resolve_tier()` reads it. Call sites in
   `routes.py` don't change.
3. **Rate-limit → Redis** (Upstash): reimplement `app/services/usage.py` with
   `INCR`/`EXPIRE`; identical signatures.
4. Gate each **new product's** advanced features by adding entitlement keys in
   `entitlements.py` (one place) — same pattern as Riyaz.

### Extension points (where to touch, nothing else)
- Add/change a perk → `app/services/entitlements.py`.
- Change who is Pro → `app/api/deps.py::resolve_tier`.
- Change quota storage → `app/services/usage.py`.

---

## 2. Managing the MacBook (no external SSD)

Biggest disk hogs, in order: audio files, ML model weights/torch, Docker
volumes, and later Xcode/Android build caches.

- **Keep big binaries out of git and (mostly) off the laptop.** `.gitignore`
  covers `audio/`, `data/`, `models/`, `.venv/`, `node_modules/`. Real corpus +
  model weights live in cloud object storage (R2); keep only a small dev sample.
- **Never train ML locally** — rent serverless GPU (Modal/Replicate), pull back
  only the small final artifacts. torch + CUDA + checkpoints are tens of GB.
- **Tame Docker:** `docker system prune` regularly; prefer free managed
  Postgres/Redis over heavy local containers.
- **Watch macOS offenders:** Xcode *DerivedData* and iOS simulators (tens of GB).
  Tools: `ncdu`, `du -sh *`, OmniDiskSweeper.
- **No SSD?** Lean harder on cloud offload + aggressive pruning; periodically move
  any large local audio set to R2 and delete the local copy.
- **RAM:** keep analysis chunked/mono (already done) and run it through a bounded
  background worker so bursts can't OOM the machine.

---

## 3. Cloud services (web + Mac + Windows + iOS + Android)

API-first means **one backend serves all five clients** — costs stay centralized.

### Now (lean, free tiers — see `docs/CLOUD-SETUP.md`)
- **API hosting:** Google Cloud Run or Fly.io (scale to zero).
- **Database:** Neon or Supabase (serverless Postgres).
- **Cache/queue:** Upstash Redis.
- **Object storage:** Cloudflare R2 (no egress fees).
- **CDN + static web:** Cloudflare.
- **Errors + analytics:** Sentry + PostHog.

### When charging
- **Auth:** Supabase Auth or Clerk (web + native).
- **Billing:** RevenueCat (+ Stripe for web).
- **Email:** Resend or Postmark.

### When vocal separation / model training turns on
- **Serverless GPU:** Modal or Replicate (pay per second).

### Client/build stack (decide before going native)
- Mobile: React Native/Expo or Flutter (both do mic + DSP for Riyaz).
- Desktop: Tauri (light) or Electron (wrap the web app).
- CI/build in the cloud (Expo EAS / GitHub Actions) to keep build bloat off the
  laptop.

### Cost-control throughline
Scale-to-zero compute · R2 to kill egress · cache every computed Sa permanently ·
precompute the popular catalog so free users hit cache · meter only the genuinely
expensive operations.
