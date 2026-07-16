# SwarSaathi deployment checklist

This is the current launch path for **SwarSaathi** / **SwarPractice** after the v1.2 consumer web release.

## Current product split

- **SwarPractice:** mobile-first swara tuner with offline tanpura, reference notes, and optional local recordings.
- **SwarSaathi:** parent brand for future tools: pitch finder, discovery, raag/taal practice, song pitch catalog, and paid features later.

## What is already prepared

- Website and practice web app for the consumer experience.
- Capacitor app under `web/` with app id `com.swarsaathi.swarpractice`.
- iOS project at `web/ios/` targeted at Version `1.2`, Build `5`.
- Android project at `web/android/` targeted at Version name `1.2`, Version code `1`.
- Native Share + Filesystem plugins for recording share sheets.
- Privacy Policy and Support hosted at swarsaathi.com.

```bash
cd web
npm run build:mobile
npm run cap:sync
```

## Local mobile commands

```bash
cd /Users/sumit/Projects/indian-pitch/web
npm run build:mobile
npm run cap:sync
npm run cap:open:ios
npm run cap:open:android
```

Use Xcode for iOS signing/TestFlight and Android Studio for emulator/device testing and Play builds.

## Before App Store / Play Store submission

1. Confirm branded app icons and splash assets.
2. Test on real iPhone and Android devices:
   - Sa selection
   - Mandra/Madhya/Taar notation
   - timed and free practice
   - offline tanpura
   - reference-note playback
   - optional recording + share
3. Confirm Privacy Policy and Support URLs.
4. Update store screenshots for 1.2 surfaces.
5. Complete App Privacy / Data safety answers for microphone and local recording.

Detailed checklists:

- `docs/IOS-RELEASE.md`
- `docs/ANDROID-RELEASE.md`
- `docs/APP-STORE-METADATA.md`
- `docs/PLAY-STORE-METADATA.md`

## Signups

### Required for mobile launch

- **Apple Developer Program**: done.
- **Google Play Console**: required for the first Android release.
- **Domain / website**: live at swarsaathi.com.

### Optional before broader platform

- Sentry, PostHog/Firebase Analytics, RevenueCat, Stripe, auth, and ML hosting remain future work.

## Git/cloud order

1. Keep `audio/`, `data/`, `models/`, `.venv/`, `node_modules/`, and `web/dist/` out of git when they are large or secret.
2. Commit source, docs, Capacitor config, and native project scaffolds.
3. Deploy website via `main` when release metadata should go live.
4. Submit iOS 1.2 and Android 1.2 store builds after device QA.
