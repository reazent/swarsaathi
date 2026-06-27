# iOS release checklist for SwarPractice

Bundle id: `com.swarsaathi.swarpractice`  
Display name: `SwarSaathi`  
Parent brand: `SwarSaathi`

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

## 3. Apple Developer portal

In Apple Developer:

1. Create an App ID for `com.swarsaathi.swarpractice`.
2. Confirm microphone permission usage is acceptable.
3. Create signing certificates automatically through Xcode if possible.

## 4. Xcode signing

In `web/ios/App/App.xcodeproj`:

1. Select the `App` target.
2. Set Team to your Apple Developer team.
3. Confirm Bundle Identifier is `com.swarsaathi.swarpractice`.
4. Set Version `1.0.0`, Build `1`.
5. Run on a real iPhone and test microphone permission.

## 5. App Store Connect

Create the app:

- Name: `SwarSaathi` if available.
- Bundle ID: `com.swarsaathi.swarpractice`.
- SKU: `swarsaathi-swarpractice-ios`.
- Category: Music or Education.

Required metadata:

- Privacy Policy URL: host `web/privacy.html` through Cloudflare after the domain is ready.
- Support URL: host `web/support.html`.
- Description: "Practice Indian swaras in real time. Set your Sa, sing, see swara/saptak notation, and review accuracy and stability."
- Keywords: swara, sargam, riyaz, Indian music, pitch, tuner, singing.

## 6. Privacy answers

For SwarPractice v1:

- Microphone: used for on-device pitch detection.
- Audio recording upload: no.
- Account required: no.
- Tracking: no, unless analytics are configured in a tracking manner.
- Data sale: no.

## 7. Submit TestFlight

In Xcode:

1. Product → Archive.
2. Distribute App → App Store Connect.
3. Upload.
4. In App Store Connect, add internal testers.
5. Test on at least one real iPhone before public submission.
