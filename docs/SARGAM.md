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

Auth: Supabase Bearer token. In `APP_ENV=development`, anonymous `X-Client-Id` sessions are allowed for local testing.

## Local run

```bash
cd /Users/sumit/Projects/indian-pitch
python -m uvicorn app.main:app --reload --port 8000
```

Open http://127.0.0.1:8000/sargam/

## Production

1. Deploy API (Fly / Cloud Run) with `.env` secrets.
2. Point Stripe webhook to `https://<api-host>/api/v1/billing/stripe/webhook`.
3. Deploy `site/` to Cloudflare Pages (includes `/sargam/`).
4. Set Sargam page meta `swarsaathi-api` to the API origin if Pages and API differ.

## Free / low-cost API hosting options

| Option | Notes |
| --- | --- |
| **[Fly.io](https://fly.io)** free allowance | Simplest fit for this FastAPI Dockerfile; scale-to-zero-ish machines; good default. |
| **[Google Cloud Run](https://cloud.google.com/run)** | Free tier + any Google credits; pay per request after; great with Neon. |
| **[Railway](https://railway.app)** trial/hobby | Fast deploy from GitHub; watch usage after trial. |
| **[Render](https://render.com)** free web service | Easy, but free tier spins down and cold-starts are slower. |

Recommendation: **Fly.io** if you want the least friction with the existing `Dockerfile`; **Cloud Run** if you want to burn Google credits.
