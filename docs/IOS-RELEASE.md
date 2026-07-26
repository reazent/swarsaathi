# iOS release checklist for SwarPractice

Bundle id: `com.swarsaathi.swarpractice`  
Display name: `SwarSaathi`  
Parent brand: `SwarSaathi`  
Current target: Version `1.2`, Build `7`

## 1. Local prerequisites

Install full Xcode from the App Store, then run:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -version
```

## 2. Build and open iOS project

```bash
cd /Users/sumit/Projects/indian-pitch/web
npm run build:mobile
npm run cap:sync
npm run cap:open:ios
```

## 3. Xcode signing

In `web/ios/App/App.xcodeproj`:

1. Select the `App` target.
2. Set Team to your Apple Developer team.
3. Confirm Bundle Identifier is `com.swarsaathi.swarpractice`.
4. Confirm Version `1.2`, Build `7`.
5. Confirm **Signing & Capabilities** includes **Push Notifications** (uses `App/App.entitlements` with `aps-environment`).
6. In [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list), open `com.swarsaathi.swarpractice` and enable **Push Notifications** if it is not already on (required for App Store / in-app update notifications).
7. Run on a real iPhone and test:
   - microphone consent and permission
   - live pitch detection
   - offline tanpura
   - reference-note playback
   - session recording
   - Share sheet for a recording

## 4. App Store Connect

Use existing app:

- Name: `SwarSaathi`
- Bundle ID: `com.swarsaathi.swarpractice`
- App ID: `id6781765064`

Update:

- What’s New for 1.2 from `docs/APP-STORE-METADATA.md`
- Privacy Policy URL: `https://swarsaathi.com/privacy.html`
- Support URL: `https://swarsaathi.com/support.html`
- App Privacy answers for optional local recording
- Screenshots for recordings, reference note, and accompaniment

## 5. Privacy answers for 1.2

- Microphone: used for on-device pitch detection.
- Optional local recording: saved on device until the learner shares or deletes it.
- Audio recording upload by SwarSaathi: no.
- Account required: no.
- Tracking: no, unless analytics are configured in a tracking manner.
- Data sale: no.

## 6. Xcode Cloud

Capacitor iOS SPM packages live under `web/node_modules` (gitignored). Xcode Cloud must install them before resolving packages.

Script (already in repo): `web/ios/App/ci_scripts/ci_post_clone.sh`

It runs `npm ci`, `npm run build:mobile`, and `npx cap sync ios` in `web/`.

In App Store Connect → Xcode Cloud → your workflow, confirm Post-Clone is enabled (custom scripts next to `App.xcodeproj` are picked up automatically). If a build still fails on missing `@capacitor/filesystem` / `@capacitor/share`, re-run after this script is on the branch Xcode Cloud builds.

## 7. Submit TestFlight

In Xcode:

1. Product → Archive.
2. Distribute App → App Store Connect.
3. Upload.
4. In App Store Connect, add internal testers.
5. Test on at least one real iPhone before public submission.

## 8. After App Store approval

Update `site/release.json` and `site/release-links.js` fallback:

- `version`: `1.2`
- `build`: `7`
- `status`: `Live on App Store`
- `updatedAt`: approval date

Then commit and push `main` so the website reflects the live release.
