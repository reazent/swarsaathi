# Android release checklist for SwarPractice

Application id: `com.swarsaathi.swarpractice`  
Display name: `SwarSaathi`  
Parent brand: `SwarSaathi`  
Current target: Version name `1.2`, Version code `1` (first Play release)

## 1. Local prerequisites

Install Android Studio and a JDK, then confirm:

```bash
java -version
cd /Users/sumit/Projects/indian-pitch/web
npm run build:mobile
npm run cap:sync
npm run cap:open:android
```

## 2. Signing

Create a Play upload keystore if one does not already exist, and keep it outside git.

Example:

```bash
keytool -genkey -v \
  -keystore ~/swarsaathi-upload.keystore \
  -alias swarsaathi \
  -keyalg RSA -keysize 2048 -validity 10000
```

Configure signing in Android Studio or a local `keystore.properties` that is not committed.

## 3. Device QA before upload

On a real Android phone, verify:

1. App launches as **SwarSaathi**.
2. Microphone permission prompt and pitch detection.
3. Offline tanpura for available pitches.
4. Reference-note playback.
5. Optional session recording save/play/delete.
6. Share sheet for a recording.
7. Airplane-mode practice still works after assets are cached.

## 4. Play Console setup

Create the app:

- App name: `SwarSaathi`
- Package name: `com.swarsaathi.swarpractice`
- Category: Music & Audio or Education
- Free

Required store assets:

- Short description and full description from `docs/PLAY-STORE-METADATA.md`
- Feature graphic and phone screenshots
- Privacy Policy URL: `https://swarsaathi.com/privacy.html`
- Support email: `support@swarsaathi.com`

## 5. Data safety answers

- Microphone: used for on-device pitch detection.
- Optional local recording: stored on device until the user shares or deletes it.
- Audio uploaded by SwarSaathi: no.
- Account required: no.
- Advertising ID: no.
- Data sale: no.

## 6. Build and upload

In Android Studio:

1. Build → Generate Signed Bundle / APK.
2. Choose Android App Bundle.
3. Upload the `.aab` to Play Console Internal testing.
4. Promote to Closed / Production after QA.

## 7. After Play Store approval

Add the Play Store URL to website release metadata when the listing is live, and note Android availability on Support / Home.
