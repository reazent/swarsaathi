# Cloud setup checklist (free tiers)

I can't create these accounts for you (each needs your email + 2FA, sometimes a
card even on free tiers). This is the exact order to do it in, what to grab from
each, and where it goes in `.env`. Do the **Now** block first; the rest can wait.

> Tip: you mentioned possible **Google Cloud credits** — if so, prefer Cloud Run
> (API) + Cloud SQL (Postgres) to burn credits, and keep R2 for storage (no
> egress fees). Otherwise the picks below are the cheapest path.

---

## NOW — core stack (≈30–40 min)

### 1. GitHub  ✅ (you have an account)
- Re-auth the CLI so I can create + push the repo:
  ```bash
  gh auth refresh -h github.com    # or: gh auth login
  ```
- Done: repo pushed to https://github.com/reazent/shruti (public for now; flip to
  private at launch with `gh repo edit --visibility private`).

### 2. Cloudflare (CDN + R2 object storage)
- Sign up: https://dash.cloudflare.com/sign-up
- Enable **R2** (needs a card on file; free tier: 10 GB storage, no egress).
- Create a bucket: `shruti-audio`. Create an **R2 API token** (Account → R2 → Manage API Tokens).
- Grab: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=shruti-audio`.

### 3. Neon (serverless Postgres)  — or Supabase if you want Auth too later
- Sign up: https://console.neon.tech/signup
- Create project `shruti` → copy the **connection string**.
- Grab: `DATABASE_URL=postgresql://...` (use the *pooled* connection string).

### 4. Upstash (serverless Redis)
- Sign up: https://console.upstash.com
- Create a Redis database (pick a region near your API).
- Grab: `REDIS_URL=rediss://...` (the TLS URL).

### 5. API hosting — Fly.io (simplest) or Google Cloud Run (if using credits)
- Fly: https://fly.io/app/sign-up — `brew install flyctl && fly auth signup`, later `fly launch` (we have a Dockerfile).
- Cloud Run: https://console.cloud.google.com — create a GCP project; we deploy the container later.
- Nothing to put in `.env` yet — this *hosts* the app.

### 6. Sentry (errors) + PostHog (analytics)
- Sentry: https://sentry.io/signup → create a project (Python) → grab `SENTRY_DSN`.
- PostHog: https://us.posthog.com/signup → create a project → grab `POSTHOG_KEY` (+ host).

---

## WHEN YOU START CHARGING

### 7. Auth — Supabase Auth or Clerk
- Supabase: https://supabase.com/dashboard/sign-up  · Clerk: https://dashboard.clerk.com/sign-up
- Grab the project URL + anon/public key + a server key.

### 8. RevenueCat (subscriptions across iOS/Android/web)
- Sign up: https://app.revenuecat.com/signup
- Create an app; you'll add App Store / Play products later.
- Grab the public SDK keys + a server secret for the entitlement webhook.

### 9. Stripe (web payments, fed into RevenueCat)
- Sign up: https://dashboard.stripe.com/register
- Grab `STRIPE_SECRET_KEY` + webhook signing secret.

### 10. Email — Resend or Postmark
- Resend: https://resend.com/signup  · Postmark: https://account.postmarkapp.com/sign_up
- Verify a sending domain; grab the API key.

---

## WHEN VOCAL SEPARATION / TRAINING TURNS ON

### 11. Modal or Replicate (serverless GPU)
- Modal: https://modal.com/signup  · Replicate: https://replicate.com (sign in with GitHub)
- Grab the API token. Used for Demucs/Sa-classifier jobs — pay per second.

---

## Where it all goes
Copy `.env.example` → `.env` and fill values as you collect them. The app reads
only what it needs; unset integrations stay dormant. **Never commit `.env`**
(already in `.gitignore`).

## Suggested order of operations
1. GitHub re-auth → I push the repo (backup + CI foundation).
2. R2 + Neon + Upstash (storage, db, cache).
3. Deploy API to Fly/Cloud Run; point it at Neon + Upstash + R2.
4. Sentry + PostHog.
5. (Later) Auth → RevenueCat → Stripe when the paywall goes live.
6. (Later) Modal/Replicate when the ML pipeline ships.
