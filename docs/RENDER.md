# Deploy SwarSaathi API on Render (free)

Site stays on Cloudflare Pages. API runs on Render.

## 1. Sign up

1. https://render.com/register  
2. Connect GitHub → grant access to `reazent/swarsaathi` (or your fork)

## 2. Create the web service

**Option A — Blueprint (recommended)**  
1. Dashboard → **New** → **Blueprint**  
2. Select the repo (branch `main`)  
3. Apply `render.yaml` → service name `swarsaathi-api`, plan **Free**

**Option B — Manual**  
1. **New** → **Web Service** → this repo  
2. Runtime: **Docker**  
3. Branch: `main`  
4. Plan: **Free**  
5. Health check path: `/health`

## 3. Environment variables

In the service → **Environment**, paste from your local `.env` (production values):

Required for Sargam:
- `DATABASE_URL` — Neon Postgres URL  
- `FAL_KEY`  
- `SUPABASE_URL`  
- `SUPABASE_ANON_KEY`  
- `SUPABASE_SERVICE_KEY`  
- `STRIPE_SECRET_KEY`  
- `STRIPE_PUBLISHABLE_KEY`  
- `APP_ENV=production`  
- `CORS_ORIGINS=https://swarsaathi.com,https://www.swarsaathi.com`

Optional: `SENTRY_DSN`, `POSTHOG_KEY`, `RESEND_API_KEY`, RevenueCat keys, `STRIPE_WEBHOOK_SECRET` (after step 5)

## 4. Deploy

Production URL:

`https://swarsaathi-api.onrender.com`

Check: `https://swarsaathi-api.onrender.com/health` → `{"status":"ok",...}`

**Cold starts:** free tier sleeps after idle; first request after sleep can take 30–60s.

**Request length:** keep generations ≤ ~60–90s of wall time on free; prefer 30s clips at first.

## 5. Point the website at the API

In `site/sargam/index.html`:

```html
<meta name="swarsaathi-api" content="https://swarsaathi-api.onrender.com" />
```

Commit + push `main` so Cloudflare Pages picks it up.

## 6. Stripe webhook

Stripe → Developers → Webhooks → Add endpoint:

`https://<your-service>.onrender.com/api/v1/billing/stripe/webhook`

Events: `checkout.session.completed`  
Copy signing secret → Render env `STRIPE_WEBHOOK_SECRET` → redeploy.

## 7. Sargam sign-in email (Resend, free)

Free-tier Supabase locks custom magic-link templates when using their default SMTP. Sargam avoids that:

1. API calls Supabase Admin `generate_link` (returns OTP, does **not** send Supabase mail)
2. API emails the code via **Resend** from `RESEND_FROM`
3. Browser verifies the code with Supabase `verifyOtp`

Required Render env vars:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- `RESEND_API_KEY`, `RESEND_FROM` (e.g. `SwarSaathi <support@swarsaathi.com>`)

Optional (only if you still use link redirects): Site URL `https://swarsaathi.com` and redirect allow list `https://swarsaathi.com/sargam/**`.
