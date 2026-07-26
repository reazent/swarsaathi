# Sargam

Text-to-audio product on SwarSaathi using **Stability AI Stable Audio 3 Medium** via **Fal**.

## Pricing (v1)

| Rule | Value |
| --- | --- |
| Signup bonus | 3 credits |
| Credit size | 30 seconds of audio |
| Cost | `ceil(duration / 30)` credits |
| Max duration | 180 seconds (configurable) |
| Packs | Starter 20 / $9 · Studio 100 / $39 · Label 500 / $149 |

Fal list price is roughly a few cents per clip; packs include margin for failed retries, support, and infra.

## API

- `GET /api/v1/sargam/config` — public client config
- `GET /api/v1/sargam/me` — credits + packs
- `POST /api/v1/sargam/generate` — `{prompt, duration}`
- `POST /api/v1/sargam/checkout` — Stripe Checkout for a pack
- `POST /api/v1/billing/stripe/webhook` — grants credits on `checkout.session.completed`

Auth: Supabase magic-link → Bearer token on API calls. In production, `/me` works signed-out (0 credits); generate/checkout require sign-in. In `APP_ENV=development`, anonymous `X-Client-Id` sessions are allowed for local testing.

**Supabase checklist (production sign-in):** Site URL `https://swarsaathi.com` and redirect allow list including `https://swarsaathi.com/sargam/**` — see `docs/RENDER.md` §7.

## Local run

```bash
cd /Users/sumit/Projects/indian-pitch
python -m uvicorn app.main:app --reload --port 8000
```

Open http://127.0.0.1:8000/sargam/

## Production

API host: **Render** (see `docs/RENDER.md`).

1. Deploy API on Render with `.env` secrets.
2. Point Stripe webhook to `https://<render-host>/api/v1/billing/stripe/webhook`.
3. Site on Cloudflare Pages (`/sargam/`).
4. Set `<meta name="swarsaathi-api" content="https://<render-host>" />` in `site/sargam/index.html`.
