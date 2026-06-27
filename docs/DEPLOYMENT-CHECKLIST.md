# SwarSaathi deployment checklist

This is the current launch path after renaming the parent brand to **SwarSaathi** and the tuner app to **SwarPractice**.

## Current product split

- **SwarPractice:** mobile-first swara tuner. Current features stay free for v1.
- **SwarSaathi:** parent brand for future tools: pitch finder, discovery, raag/taal practice, song pitch catalog, and paid features later.

## What is already prepared

- User-facing app branding changed to **SwarPractice** / **SwarSaathi**.
- Capacitor added under `web/` with app id `com.swarsaathi.swarpractice`.
- iOS project generated at `web/ios/`.
- Android project generated at `web/android/`.
- Mobile web bundle script added:

```bash
cd web
npm run build:mobile
npm run cap:sync
```

- Native mic permissions added:
  - iOS: `NSMicrophoneUsageDescription`
  - Android: `android.permission.RECORD_AUDIO`

## Local mobile commands

```bash
cd /Users/sumit/Projects/indian-pitch/web
npm run build:mobile
npm run cap:sync
npm run cap:open:ios
npm run cap:open:android
```

Use Xcode for iOS signing/TestFlight and Android Studio for emulator/device testing and Play builds.

Local build prerequisites still needed on this Mac:

- Full **Xcode** from the App Store, then select it with `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
- **Android Studio** plus a JDK. Android builds currently fail until Java is installed/configured.

## Before App Store / Play Store submission

1. Replace default Capacitor app icon and splash assets.
2. Test microphone permission prompts on real iPhone and Android devices.
3. Test:
   - Sa selection
   - Mandra/Madhya/Taar notation
   - timed mode
   - free mode summary
   - speaker-test octave correction off for singing
4. Add privacy policy URL and support URL.
5. Decide final public app name after store/domain availability checks.
6. Create store screenshots and short app description.
7. Prepare age rating / data safety answers:
   - microphone used for pitch detection
   - audio processed on device
   - no recording uploaded for SwarPractice v1

## Signups to initiate

### Required for mobile launch

- **Apple Developer Program**: done.
- **Google Play Console**: later, after iOS.
- **Domain registrar**: later.
- **GitHub**: rename current repo from `shruti` to `swarsaathi`.

### Strongly recommended before public beta

- **Sentry**: account done; need project DSN.
- **PostHog** or **Firebase Analytics**: account done; need project key/host if using PostHog.
- **Cloudflare**: account done; domain/DNS later.

## Keys to provide to the app

When ready, share these values out-of-band and put them in `.env` or a native-safe public config:

- `SENTRY_DSN`
- `POSTHOG_KEY`
- `POSTHOG_HOST`
- Cloudflare account id / Pages project name / R2 bucket credentials when backend assets move there

### Needed when the broader SwarSaathi platform goes live

- **Neon** or **Supabase Postgres**: production database.
- **Upstash Redis**: cache/queue/rate limiting.
- **Fly.io** or **Google Cloud Run**: API hosting.
- **Supabase Auth** or **Clerk**: user accounts.
- **RevenueCat**: future iOS/Android subscriptions.
- **Stripe**: future web payments.
- **Resend** or **Postmark**: transactional email.
- **Modal** or **Replicate**: future ML/audio processing jobs.

## Git/cloud order

1. Create/confirm GitHub repo and push the code.
2. Keep `audio/`, `data/`, `models/`, `.venv/`, `node_modules/`, and `web/dist/` out of git.
3. Commit source code, docs, Capacitor config, and native project scaffolds.
4. Add GitHub Actions later for web checks and mobile build validation.
5. Deploy backend only when Pitch Finder / Discover need public access. SwarPractice v1 can ship as an on-device mobile app first.
