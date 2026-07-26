# Sargam

Text-to-audio product on SwarSaathi with two **consumer modes** (model names stay internal):

| UI mode | Purpose | Engine (server-side) |
| --- | --- | --- |
| **Full song** | Complete tracks with optional lyrics/vocals | Fal `fal-ai/ace-step` (+ `prompt-to-audio`). Supports lyrics; Fal does **not** document this as `acestep-v15-xl-turbo` specifically (API looks like classic ACE-Step: ~27 steps / CFG knobs). Target HF for future self-host: `ACE-Step/acestep-v15-xl-turbo` |
| **Music sketch** | Short beds / textures | Fal Stable Audio 3 Medium |

**Vocals:** leave lyrics blank to auto-write sung lyrics, paste lyrics for control, or tick Instrumental for no vocals.

## Pricing (v1)

| Rule | Value |
| --- | --- |
| Signup bonus | 3 credits |
| Credit size | 30 seconds of audio |
| Cost | `ceil(duration / 30)` credits |
| Max duration (sketch) | 180 seconds |
| Max duration (song) | 240 seconds |
| Packs | Starter 20 / $9 · Studio 100 / $39 · Label 500 / $149 |

## API

- `GET /api/v1/sargam/config` — public client config + `modes[]` (labels only)
- `GET /api/v1/sargam/me` — credits + packs + modes
- `POST /api/v1/sargam/generate` — `{mode, prompt, duration, lyrics?, instrumental?}`
- `POST /api/v1/sargam/checkout` — Stripe Checkout for a pack
- `POST /api/v1/billing/stripe/webhook` — grants credits on `checkout.session.completed`

`mode` is only `"song"` or `"clip"`. Never send vendor model ids from the browser.

Auth: API emails a Supabase OTP via Resend → browser session → Bearer token. In production, `/me` works signed-out (0 credits); generate/checkout require sign-in.

See `docs/RENDER.md` §7 for Resend + Supabase service-role env vars.

## Local run

```bash
cd /Users/sumit/Projects/indian-pitch
python -m uvicorn app.main:app --reload --port 8000
```

Open http://127.0.0.1:8000/sargam/

## Production

API host: **Render** (see `docs/RENDER.md`).

1. Deploy API on Render with `.env` secrets (`FAL_KEY`, ACE model envs optional — defaults in `render.yaml`).
2. Point Stripe webhook to `https://<render-host>/api/v1/billing/stripe/webhook`.
3. Site on Cloudflare Pages (`/sargam/`).
4. Set `<meta name="swarsaathi-api" content="https://<render-host>" />` in `site/sargam/index.html`.
