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

## 7. Supabase Auth (required for Sargam sign-in)

Sargam signs in with a **6-digit email code** (OTP). Clicking the email link alone often only confirms the address if the link opens in a different browser than the one that requested sign-in (PKCE).

### URL configuration

Supabase Dashboard → **Authentication** → **URL configuration**:

- **Site URL:** `https://swarsaathi.com`
- **Redirect URLs** (add all):
  - `https://swarsaathi.com/sargam`
  - `https://swarsaathi.com/sargam/**`
  - `https://www.swarsaathi.com/sargam/**`
  - `http://127.0.0.1:8000/sargam/**`
  - `http://localhost:8000/sargam/**`

### Email template (required for the 6-digit code)

Dashboard → **Authentication** → **Email templates** → **Magic Link**:

```html
<h2>Your Sargam sign-in code</h2>
<p>Enter this code on the Sargam page:</p>
<p style="font-size:24px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
<p>Or open this link in the <em>same</em> browser where you requested sign-in:</p>
<p><a href="{{ .ConfirmationURL }}">Sign in to Sargam</a></p>
```

Optional (works across browsers without typing a code) — use a token-hash link instead of `{{ .ConfirmationURL }}`:

```html
<p><a href="{{ .SiteURL }}/sargam/?token_hash={{ .TokenHash }}&type=email">Sign in to Sargam</a></p>
```

Also confirm **Authentication → Providers → Email** is enabled. On the free plan, Supabase rate-limits outbound auth email (~2/hour) until you attach custom SMTP.
