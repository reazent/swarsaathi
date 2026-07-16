# SwarSaathi / SwarPractice v1.2 implementation plan

This document captures emerging v1.2 ideas. It is a planning checklist only; do not treat unchecked items as implemented.

## Release intent

v1.2 should build on the v1.1 launch by making accompaniment more production-ready, more efficient, and less dependent on network quality while keeping the app small enough for iOS and future Android distribution.

Initial focus:

- Offline-capable tanpura playback without bundling the full 1.5 GB source library.
- Automated audio preparation so tanpura loops do not need to be manually chopped.
- Preserve real recorded tanpura and tabla sound quality.
- Keep Cloudflare R2 as the master/fallback asset source.
- Ship without tabla accompaniment; retain metronome for rhythm and prepare tabla separately for v1.3.
- Turn the current website and practice experience into a coherent, consumer-app-quality product across mobile and desktop.
- Add credible business-development surfaces without diluting the learner-first experience.

## Confirmed v1.2 product decisions

- Monetization is not finalized for v1.2. The access model may change after the separate monetization plan is defined.
- Current product assumption: core offline accompaniment remains broadly available, but final free/pro packaging should be revisited before implementation.
- Tanpura should cover all available pitches in all available tunings in the same way for all users.
- Tabla should follow the same product principle: real recorded sound and efficient offline playback.
- Tabla cannot practically ship as one full loop for every taal at every BPM. The design should support BPM changes without requiring a separate full recording for every BPM value.
- The app should continue to prevent misleading accompaniment: if an exact correct pitch/tuning/taal asset is not available, the UI should disable or clearly limit that option instead of playing the wrong sound.
- v1.1 introduced a useful behavior where tanpura can keep playing while the user returns from Accompaniment mode to Riyaz mode. Preserve this in v1.2 so users can visualize sung pitch while matching against tanpura.
- First external instrument play-along path should focus on piano and electronic keyboard.
- Riyaz mode should add auditory reference-note confirmation in addition to visual pitch feedback: users should be able to play any selected swara/note continuously while singing against it.
- Session recording and recording sharing should be included in v1.2, not deferred to a v1.2.x follow-up, subject to implementation risk and App Store privacy review readiness.
- **Decision (2026-07-10): v1.2 ships without tabla accompaniment.** Master tabla recordings will take longer than the release allows, and a rushed tabla would violate the iTablaPro-benchmark quality bar. Tabla moves to v1.3 (see tabla section status note). Metronome remains the rhythm aid for v1.2.
- **Decision (2026-07-10): v1.2 includes a UI/UX differentiation pass.** Web and mobile currently look identical and are not intuitive enough. Mobile gets a native-feeling layout (bottom navigation, larger touch targets, thumb-reachable primary controls); web gets a proper desktop layout; plus a first-run onboarding pass.

## Confirmed v1.2 decision: world-class consumer product experience

### Product outcome

v1.2 should not look like a marketing page with a web utility attached. It should feel like one coherent consumer music product:

- the public website explains the value quickly and earns trust;
- the signed-in or launched practice surface feels like an app;
- mobile prioritizes one-handed daily practice;
- desktop uses the available space for richer context without becoming a stretched phone screen;
- learners can move from discovery to first successful practice in under two minutes;
- business-development content is available through clear secondary routes, not mixed into the primary learner journey.

The existing visual direction may evolve, but the redesign must preserve a calm Indian-music identity and avoid a generic SaaS-dashboard or gaming aesthetic.

### Experience principles

1. **Practice first.** The primary action on every learner-facing surface is to start or resume practice.
2. **One job per screen.** Keep pitch selection, live feedback, accompaniment, recording, and review focused; reveal advanced controls progressively.
3. **Musical correctness over apparent choice.** Disable unsupported notes, pitches, tunings, or combinations and explain why.
4. **Immediate feedback.** Every tap should produce a clear visual, audible, or haptic response; loading and microphone states must never be ambiguous.
5. **Calm confidence.** Use generous spacing, strong hierarchy, restrained motion, and plain language.
6. **Accessible by default.** Do not depend on color alone for pitch accuracy; support Dynamic Type/zoom, reduced motion, keyboard use, and screen readers.
7. **Privacy visible at the moment of need.** Explain microphone and recording behavior immediately before permission requests.
8. **Consistent, not identical.** Web and mobile share language, tokens, and mental models while using platform-appropriate navigation and layouts.

### Consumer information architecture

The website should be reorganized around user intent rather than a long list of anchors.

Primary learner navigation:

- **Home** — concise value proposition, live product proof, trust, and a single dominant `Start practicing` action.
- **Practice** — launch/resume SwarPractice.
- **Learn** — guided explanation of Riyaz, Your Sa, swaras, accompaniment, and upcoming learning paths.
- **Products** — SwarPractice (available), SurLens and SwarPath (clearly labelled by status).
- **Progress / Recordings** — shown only when implemented; never use a dead navigation item.

Secondary company/business navigation:

- **For Teachers**
- **For Music Schools**
- **Partners**
- **Research & Technology**
- **About**
- **Support / Privacy**

Desktop may expose primary learner navigation in the header and business links in a `Company` or `Partners` menu. Mobile should keep learner actions in bottom navigation and business/company links in the menu/footer.

### Homepage redesign: consumer-app landing experience

The current homepage is informative but reads as a sequence of similarly weighted marketing sections. Replace it with a guided story:

1. **Hero with real product proof**
   - one clear promise: accurate, calm Indian-music practice;
   - one primary CTA (`Start practicing`);
   - one App Store CTA;
   - a real or production-faithful app preview, not a decorative mock-up with unsupported features.
2. **Try-it-now moment**
   - lightweight interactive or animated demonstration of `sing → see swara → correct`;
   - no microphone permission until the user explicitly starts.
3. **Three-step learner journey**
   - set Your Sa;
   - practise with visual/auditory guidance;
   - review or share a session.
4. **Product modules**
   - cards based on user outcomes, with explicit `Available`, `In development`, or `Planned` status;
   - no roadmap feature should look tappable or available prematurely.
5. **Trust**
   - on-device analysis, honest asset availability, App Store status, privacy, and accessibility.
6. **Audience pathways**
   - learner, teacher, and music-school routes with distinct outcomes.
7. **Business/partner invitation**
   - compact section near the end, linking to dedicated business pages rather than dominating the consumer homepage.
8. **High-quality footer**
   - product, learn, company, legal, support, social/contact, and release status.

### App-shell redesign

#### Mobile / installed app

- Persistent bottom navigation with at most four primary destinations:
  - `Practice`
  - `Accompaniment`
  - `Recordings`
  - `More`
- If Recordings is not ready at launch, use three items rather than a placeholder.
- Keep the main start/stop/listen control in the thumb zone.
- Minimum touch target: 44×44 CSS points; preferred primary controls: 48–56 points.
- Use safe-area insets and test compact iPhones, large iPhones, landscape, and increased text size.
- Present pitch, note, and session choices in bottom sheets or focused screens rather than dense inline panels.
- Preserve playback across relevant navigation and show a persistent mini-player/status bar when tanpura or reference-note audio is active.

#### Desktop web app

- Use a real app shell: compact top bar, optional left navigation, central practice stage, and contextual right-side panel.
- Keep the live swara and accuracy display visually dominant.
- Use the side panel for accompaniment, reference-note, session, and advanced settings instead of stacking all mobile controls vertically.
- Support keyboard shortcuts for start/stop, reference note, metronome, and recording, with an discoverable shortcut help panel.
- Constrain readable content width; do not stretch mobile cards across the viewport.

### Core v1.2 user journeys

#### First successful practice

1. User lands on Home or opens the app.
2. Chooses `Start practicing`.
3. Sees a short value-led onboarding sequence:
   - what SwarSaathi listens for;
   - choose Your Sa (with help if unknown);
   - allow microphone with privacy explanation.
4. Completes a guided 10–20 second note-hold exercise.
5. Receives a plain-language result and one recommended next action.

Allow onboarding to be skipped and replayed. Store completion locally unless account sync is later introduced.

#### Returning practice

- Open directly to the last valid setup.
- Show `Resume practice` with last Sa, mode, and accompaniment state.
- Never auto-start microphone, tanpura, or recording.

#### Reference-note practice

- Select note by swara first; show western note as secondary context where useful.
- Preview/play continuously, sing, compare, pause, and replay without leaving Riyaz.
- Clearly distinguish `Reference note`, `Tanpura`, and `Metronome`.
- If simultaneous reference note + tanpura harms pitch detection or learning clarity, default to mutually exclusive and explain the choice.

#### Recording and sharing

- Obtain explicit recording permission and show what will be captured.
- Show recording state persistently with elapsed time and a clear stop action.
- After stopping: play, rename, delete, share, or return to practice.
- Default to local storage; no cloud-upload implication without a separate consent and privacy design.

### Visual and interaction system

Create a small documented design system before page-by-page implementation:

- semantic color tokens for background, surface, text, success, warning, error, pitch states, and focus;
- typography scale optimized for both Devanagari and Latin text;
- spacing, radius, elevation, icon, and motion tokens;
- component states: default, hover, pressed, focused, selected, disabled, loading, permission-denied, and unavailable;
- reusable components for app header, bottom navigation, buttons, pitch selector, swara display, audio source selector, mini-player, session timer, cards, sheets/dialogs, empty states, notices, and toasts;
- dark and light appearance only if both can meet the quality bar; otherwise ship one polished theme in v1.2.

Use real icons from one consistent icon family. Do not use emoji as production controls. Motion should confirm state changes and musical timing, not decorate every section.

### Business-development sections

Business content should support real conversations and measurable leads.

#### For Teachers

- classroom/homework use cases;
- assignment and practice-review vision, clearly marked planned where applicable;
- teacher pilot CTA with a short qualification form;
- downloadable one-page overview only when it reflects shipped capabilities.

#### For Music Schools and Institutions

- lab/classroom deployment use cases;
- device/platform availability;
- privacy and local-processing posture;
- pilot-program CTA;
- fields: institution, location, learner count, teaching format, contact, and goal.

#### Partnerships

- music catalog/metadata and ISRC partnerships;
- licensed official-audio analysis;
- Indian instrument/sample collaborations;
- rights conversations for notation and learning experiences;
- integration/data partnership CTA routed separately from support.

#### Research & Technology

- explain Sa detection, pitch feedback, local microphone processing, and model limitations in credible non-marketing language;
- publish validation methodology and benchmark summaries when available;
- invite research, conservatory, and dataset collaborations;
- never imply clinical, examination, or guaranteed learning outcomes without evidence.

#### Press / About / Contact

- product story and mission;
- founder/team information when ready;
- approved product screenshots, icon, short description, and contact;
- distinct email/form routes for support, teaching pilots, institutional pilots, partnerships, and press.

### Business lead handling

Do not use one generic mailto link as the final system. Add lightweight, privacy-conscious forms with:

- route/source attribution;
- success and failure states;
- spam protection;
- minimum necessary fields;
- consent copy and retention statement;
- delivery to a durable lead destination;
- event tracking for submitted leads without capturing sensitive form content in analytics.

### Content and product truth

- Replace vague future-facing copy with outcome-led language.
- Clearly label product state: `Available`, `Beta`, `In development`, `Planned`.
- Remove or correct UI previews that imply deferred tabla is available in v1.2.
- Keep one naming hierarchy: `SwarSaathi` is the consumer brand/portal; `SwarPractice`, `SurLens`, and `SwarPath` are product modules.
- Write English copy first, but make layouts and components ready for Hindi/Devanagari and future localization.

### Accessibility, performance, privacy, and quality gates

Required before release:

- WCAG 2.2 AA color contrast and interaction review;
- visible keyboard focus and full keyboard operation on web;
- VoiceOver/TalkBack labels and logical reading order;
- 200% browser zoom and large-text testing without lost controls;
- reduced-motion support;
- no color-only pitch result;
- permission-denied, no-microphone, offline, unsupported-note, storage-full, and audio-interruption states;
- homepage Core Web Vitals target: LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms at the 75th percentile on supported devices;
- lazy-load below-the-fold media and avoid heavy autoplay video;
- no analytics event containing microphone audio, recordings, detected notes tied to identity, or form message bodies;
- App Store privacy labels and website privacy copy updated for recording/sharing.

### Measurement

Use a small event taxonomy to answer product questions without invasive tracking:

- homepage primary CTA;
- App Store CTA;
- practice started;
- microphone onboarding completed/denied;
- first exercise completed;
- reference note started;
- tanpura started;
- recording completed/shared;
- teacher/institution/partner form submitted.

Define a v1.2 baseline and review:

- visitor → practice-start conversion;
- onboarding completion;
- first successful session completion;
- seven-day return rate where privacy-preserving measurement is possible;
- audio/permission error rate;
- qualified business leads by route.

### UI/UX deliverables and acceptance criteria

Before implementation:

- sitemap and navigation model;
- low-fidelity flows for first practice, returning practice, accompaniment, recording, and lead submission;
- mobile and desktop high-fidelity designs for key states;
- design tokens and component inventory;
- content/status matrix for every product and roadmap claim;
- accessibility and analytics specification.

v1.2 UI/UX is complete only when:

- a first-time user can reach a successful practice result without external instruction;
- mobile and desktop use purpose-built layouts, not merely responsive reflow;
- active audio remains understandable across navigation;
- all permission/error/offline states are designed and tested;
- deferred functionality never appears available;
- business routes produce usable, distinguishable leads;
- critical flows pass accessibility, performance, and real-device usability checks.

### Reviewable UI/UX implementation sequence

1. **Audit and foundations**
   - inventory current routes, claims, components, breakpoints, accessibility gaps, and analytics;
   - approve sitemap, key flows, content/status matrix, tokens, and component contracts.
2. **Consumer website**
   - rebuild navigation, homepage, product/learn pages, trust and App Store surfaces;
   - add responsive business-development routes and lead funnels.
3. **Practice app shells**
   - introduce shared state/navigation contracts;
   - implement mobile and desktop shells without changing pitch-engine behavior.
4. **Core v1.2 features**
   - offline tanpura, reference note, recording, sharing, and persistent audio state.
5. **Onboarding and resilience**
   - first practice, returning practice, permissions, offline/errors, empty states, and recovery.
6. **Release hardening**
   - accessibility, performance, privacy, analytics, cross-browser, iOS real-device, and visual-regression checks.

Each phase should be independently reviewable and must preserve the working v1.1 practice flow until its replacement is validated.

### Current implementation constraints confirmed by repository review

- `site/` is the Cloudflare Pages marketing surface.
- `web/` is the SwarPractice source used by FastAPI locally and by the Capacitor mobile bundle.
- The deployed browser practice app also exists under `site/practice/` with assets under `site/static/`; these copies already contain deployment-specific differences.
- The production UI is vanilla HTML, CSS, and ES modules. The redesign does not require adopting a component framework.
- `web/js/milap.js` contains the working practice behavior and should be preserved behind stable DOM/state contracts while shells and presentation are replaced.
- The current SwarPractice layout is intentionally phone-width even on desktop, and mobile/desktop share the same WebView implementation.
- `web/milap-preview.html` is a disconnected prototype; useful patterns should be merged into production and the redundant prototype retired.

v1.2 architecture requirements:

1. Treat `web/` as the source of truth for shared practice application code and assets.
2. Generate or synchronize the deployed `site/practice/` and `site/static/` output through a repeatable build step; do not hand-maintain parallel application copies.
3. Keep the pitch engine and working session logic independent of mobile/desktop presentation.
4. Implement purpose-built mobile and desktop shells through shared semantic components/state, CSS layers or container queries, and platform capability checks.
5. Add visual-regression and smoke tests against both browser output and the Capacitor bundle.
6. Remove obsolete preview or duplicated UI files after production replacements are validated.

## Confirmed v1.2 decision: optimized offline tanpura

The current v1.1 design streams real tanpura MP3 files from:

```text
https://assets.swarsaathi.com/tanpura/...
```

That is acceptable for v1.1, but v1.2 should improve the experience:

- The app should work offline for supported tanpura pitches.
- The app should not bundle the full long-form tanpura recordings.
- Users should not have to manually download a pitch before basic use.
- Source tanpura files should remain long/high-quality master recordings.
- Code should generate compact production loops automatically.
- The same script/process should apply uniformly across all tanpura pitches and tunings. Do not treat less common pitches as a separate streaming-only class.

## Proposed v1.2 tanpura architecture

### Master assets

Keep the existing long recordings as source/master files outside the shipped app bundle:

```text
web/audio/tanpura-master/
  Sa-Pa/
  Sa-ma/
```

or keep them in external storage/R2 and download only for asset preparation.

### Automated loop preparation

Add a script such as:

```text
scripts/prepare-tanpura-loops.mjs
```

The script should:

- Read long master tanpura recordings.
- Trim leading/trailing silence.
- Detect candidate repeating cycle regions.
- Choose a clean loop region with stable tone and no attack/transient artifacts.
- Apply a short crossfade at the seam to avoid clicks.
- Normalize perceived loudness across pitches/tunings.
- Export compact files, preferably AAC/M4A or efficient MP3.
- Generate a manifest used by the app.

Target output:

```text
web/audio/tanpura-optimized/
  Sa-Pa/C3.m4a
  Sa-Pa/C-sharp3.m4a
  Sa-ma/C3.m4a
  ...

web/audio/tanpura-optimized/manifest.json
```

### App playback

The app should prefer bundled optimized loops:

1. If an optimized offline loop exists for the selected pitch/tuning, play it locally.
2. If no bundled loop exists, fall back to R2 streaming only if allowed.
3. If neither exists, disable that pitch/tuning option so beginners do not hear the wrong tonic.

The v1.1 pitch availability behavior should remain: unsupported tanpura pitches must be disabled rather than silently mapped to a wrong pitch.

## Deferred v1.3 tabla architecture

**Status (2026-07-10): deferred to v1.3.** Master recordings are not ready and the release should not wait. Interim path for v1.3: sequence full thekas from open-access tabla bol samples (real recorded strokes, consistent with the "real recorded audio" rule). Requirements for that path: (a) in-app attribution/credits screen for the sample source (App Store compliant, routine); (b) pitch-label every bol sample using the app's own pitch engine, since the source recordings do not state pitch — then select matching-pitch sample sets per Sa or shift within a safe ±1–2 semitones (dayan tuning matters most; baya is forgiving). The architecture below remains the target design.

**Theka reference:** [DigiTabla — Tals and Thekas](https://digitabla.com/reference/tals-and-thekas/). Authoritative bol-by-bol thekas with sam/khali/tali structure for all planned taals (Tintal, Kaharwa, Dadra, Ektal, Rupak, plus Jhaptal and an extended list), and companion [bol](https://digitabla.com/reference/tabla-bols/) and [notation](https://digitabla.com/reference/notation-guide/) guides. Use these thekas as the sequencing blueprint for the bol-sample engine and as the source for the synced bol display data.

### Goal

Add real tabla accompaniment that works offline, supports useful BPM control, and does not make the app huge.

Do not bundle a separate full-length tabla loop for every possible BPM. Instead, generate optimized tabla assets from owned master recordings.

### Master assets

Keep original tabla recordings as source/master files outside the shipped app bundle:

```text
web/audio/tabla-master/
  teentaal/
  keharwa/
  dadra/
  ektaal/
  rupak/
```

Each master should ideally include metadata:

- taal name,
- reference BPM,
- beat count,
- sam/khali/tali positions,
- pitch/tonal center if relevant,
- loop/cycle boundaries if known,
- source recording notes.

### Efficient tempo strategy

For each taal, v1.2 should avoid recording or bundling every BPM. Use a small number of tempo-band recordings and code-assisted playback:

1. Prepare one or more high-quality reference recordings per taal, for example slow/medium/fast when available.
2. Slice or segment the recording at musically meaningful boundaries, preferably beat-level or phrase-level segments.
3. Generate an optimized manifest with each segment's timing, reference BPM, taal structure, and safe playback-rate range.
4. At runtime, choose the nearest tempo-band asset for the requested BPM.
5. Apply only modest playback-rate adjustment inside a safe range so tabla timbre does not sound unnatural.
6. If requested BPM is outside the safe range, clamp to the nearest supported BPM or disable the unsupported range clearly.

Confirmed direction: tabla should be scheduled from beat/phrase segments, not only from one full-cycle loop. Phrase segments may be provided for different pitch centers, so the manifest must support pitch-specific phrase assets.

Confirmed v1.2 tempo bands:

| Band | BPM range | Label |
| --- | ---: | --- |
| 1 | 10-25 | Ati-Vilambit |
| 2 | 26-80 | Vilambit / Slow |
| 3 | 81-150 | Madhya / Medium |
| 4 | 151-300 | Drut / Fast |
| 5 | 301-700 | Ati-Drut |

The app should expose a full 10-700 BPM control range. Tabla playback should be governed by manifest support within those bands.

Recommended safe initial playback-rate range:

```text
0.90x to 1.12x
```

This range should be validated by listening tests. If tabla quality suffers, use more tempo bands instead of wider playback-rate changes.

### Tabla preparation script

Add a script such as:

```text
scripts/prepare-tabla-loops.mjs
```

The script should:

- Read tabla master recordings.
- Trim leading/trailing silence.
- Detect or use provided cycle boundaries.
- Slice cycles into beat-level or phrase-level segments where musically safe.
- Preserve sam accents and taal structure.
- Normalize loudness across taals and tempo bands.
- Add small crossfades only where musically safe.
- Export compact AAC/M4A or MP3 assets.
- Generate `manifest.json` for app scheduling and BPM selection.

Target output:

```text
web/audio/tabla-optimized/
  teentaal/medium/manifest.json
  teentaal/medium/segment-001.m4a
  keharwa/medium/manifest.json
  ...
```

### Runtime playback

The app should use a Web Audio scheduler for tabla rather than a single looping `<audio>` element when beat-level control is needed.

Runtime responsibilities:

- Select taal.
- Select BPM.
- Choose nearest optimized tempo band.
- Schedule beat/phrase segments accurately.
- Keep sam and cycle accents aligned with the displayed taal.
- Display current tabla bol/phrase during playback.
- Display cycle context from the manifest: BPM, sam, khali, tali, beat number, and taal name.
- Keep tabla start/stop synchronized with metronome state where possible.
- Avoid drift over long practice sessions.

For v1.2, a simpler fallback is acceptable if quality is better:

- loop one optimized full cycle at a nearby reference BPM,
- use modest playback-rate adjustment,
- keep BPM choices constrained to the safe range exposed in the manifest.

### Tabla bol display

v1.3 should make tabla visually useful, not only audible. The app should show bols in sync with playback using generated manifests.

Manifest should support:

- taal name,
- beat count,
- beat index,
- bol text per beat or phrase,
- sam marker,
- khali marker,
- tali markers,
- reference BPM,
- requested/current BPM,
- pitch center when phrase assets are pitch-specific,
- segment file path,
- segment start/end or duration,
- safe playback-rate range.

UI should show:

- current bol prominently,
- upcoming bols or cycle row when space allows,
- sam/khali/tali markers,
- selected taal and BPM,
- clear cycle position.

### BPM selector design

Tabla and metronome BPM controls should support both granular and broad changes, similar in spirit to iTablaPro:

- single-step changes by 1 BPM,
- wider step changes by 5 BPM,
- tempo doubling (`x2`),
- tempo halving (`x/2`),
- direct slider or scrubber for quick movement,
- optional preset chips for common practice ranges.

The UI should prevent musically unsafe tabla playback:

- If a requested BPM is within safe playback-rate range, play it.
- If not, choose the nearest valid tempo band or clearly show the supported range.
- Avoid extreme time-stretching that makes tabla sound artificial.
- The overall BPM selector should allow 10-700 BPM, but tabla manifests must determine which assets can credibly render each band/range.

Metronome can support the full granular range more freely because it is generated. Tabla should follow manifest constraints.

### Tabla scope for v1.3

Initial taals:

- Teentaal
- Keharwa
- Dadra
- Ektaal
- Rupak

Tabla should remain real recorded audio. Do not ship synthetic tabla as the primary v1.3 sound.

## Proposed v1.2 Riyaz reference-note playback

### Goal

Riyaz mode should support both visual and auditory confirmation. A learner should be able to watch the pitch/swara feedback while also hearing the exact reference note they are trying to sing.

This is different from tanpura accompaniment:

- Tanpura gives the practice room / tonic environment.
- Reference-note playback gives an exact note target for call-and-response or sustained matching.

### User behavior

In Riyaz mode, add a control that lets the user play a selected note continuously:

- User chooses `Your Pitch` / Sa as usual.
- User selects the target swara/note to practice.
- User taps a play/stop button for the reference note.
- The note can continue for the selected Riyaz duration or until manually stopped.
- User can sing while the note is playing and watch the live swara, accuracy, and stability feedback.
- User can go back and forth at will: listen to the note, sing it, stop/replay it, and compare visually.

### Sound source

The reference-note sound should come from a clear keyboard-like instrument:

- piano,
- harmonium,
- electronic keyboard, or
- another clean sustained reference instrument if it sounds better on phone speakers.

For v1.2, prioritize a sound that is stable, pleasant, and easy to match by voice. The implementation may use generated/sampled instrument notes if quality and app size are acceptable.

### Note and pitch coverage

Reference-note playback should respect the same correctness rule as tanpura/tabla:

- Provide all supported swaras/notes for all supported user pitches.
- Do not silently transpose or substitute an incorrect note.
- If an exact note cannot be produced reliably, disable that option or show a clear unsupported state.

### UI relationship to accompaniment

Riyaz should let users choose the auditory aid that fits the practice moment:

- tanpura drone,
- single-note reference instrument,
- neither,
- or potentially both if listening tests show that it is musically useful and does not confuse microphone detection.

The UI should make the active sound source clear so users know whether they are hearing tanpura, a specific reference note, or both.

## Size target

Do not bundle the full tanpura library or every possible tabla BPM loop.

Target approximate bundle impact:

- Initial download sweet spot: 50 MB to 100 MB across iOS and Android.
- Preferred: under 10 MB for optimized tanpura loops.
- Acceptable early v1.2 target: under 25 MB for tanpura if coverage is wider.
- Future v1.3 combined tanpura + tabla target: stay inside the 50-100 MB initial download range if listening quality remains strong.
- Avoid: hundreds of MB or full 1.5 GB master recordings.
- If future media requirements exceed the target range, evaluate Apple On-Demand Resources and Google Play Asset Delivery rather than increasing the initial app download too much.

Candidate encoding targets:

- 8-15 second clean loops.
- AAC/M4A or MP3 at roughly 64-96 kbps.
- Mono or stereo based on listening quality; test before choosing.

Known carry-forward for v1.3:

- Offline tanpura still has a brief audible seam at loop restart on some devices. Accept for v1.2; fix with seamless dual-buffer / sample-accurate crossfade looping in the next release.

## Checklist

- [ ] Inventory all current tanpura master recordings and pitch/tuning coverage.
- [ ] Decide master asset location: local-only backup, R2 source bucket, or both.
- [ ] Add automated loop extraction script.
- [ ] Add seam/click detection or crossfade validation.
- [ ] Add loudness normalization across pitches.
- [ ] Export optimized loops into a separate app-bundled folder.
- [ ] Generate a manifest with pitch, tuning, file path, duration, encoding, and source hash.
- [ ] Apply the same optimized-loop script uniformly across all tanpura pitches and tunings.
- [ ] Update `web/scripts/build-mobile.mjs` to bundle optimized tanpura loops but continue excluding master recordings.
- [ ] Update `web/js/milap.js` to prefer local optimized loops and fall back to R2.
- [ ] Keep unsupported pitch options disabled when no correct loop exists.
- [ ] Audit existing website/app content and remove previews or copy that imply deferred features are available.
- [ ] Establish `web/` as the application source of truth and automate the `site/practice/` + `site/static/` deployment build/sync.
- [ ] Preserve `milap.js` practice behavior behind stable contracts while replacing presentation; merge useful preview patterns and retire redundant prototypes.
- [ ] Finalize consumer sitemap and separate learner navigation from business/company navigation.
- [ ] Map first-practice, returning-practice, reference-note, recording, sharing, and business-lead flows.
- [ ] Create a documented design-token and component system with Devanagari-ready typography.
- [ ] Redesign the homepage around one primary practice CTA, real product proof, learner journey, trust, and audience pathways.
- [ ] Implement platform-differentiated UI: mobile app shell (bottom nav, safe areas, thumb-reachable controls) vs desktop app shell (central practice stage and contextual panels).
- [ ] Add first-run guided practice and replayable onboarding with contextual microphone privacy explanation.
- [ ] Add persistent active-audio status/mini-player across relevant navigation.
- [ ] Design loading, disabled, unsupported, offline, permission-denied, interrupted-audio, empty, and storage-full states.
- [ ] Add dedicated business pages/routes for Teachers, Music Schools, Partnerships, Research & Technology, and About/Press.
- [ ] Replace generic partnership mailto as the primary business funnel with routed, privacy-conscious lead forms.
- [ ] Define privacy-safe analytics events and establish v1.2 conversion/error baselines.
- [ ] Complete WCAG 2.2 AA, keyboard, VoiceOver/TalkBack, large-text, reduced-motion, performance, and real-device validation.
- [ ] (Deferred to v1.3) Inventory real tabla master recordings for Teentaal, Keharwa, Dadra, Ektaal, and Rupak.
- [ ] (Deferred to v1.3) Implement tabla tempo bands: Ati-Vilambit 10-25, Vilambit 26-80, Madhya 81-150, Drut 151-300, Ati-Drut 301-700.
- [ ] (Deferred to v1.3) Add automated tabla preparation script.
- [ ] (Deferred to v1.3) Generate tabla manifests with taal structure, BPM ranges, and safe playback-rate limits.
- [ ] (Deferred to v1.3) Support pitch-specific tabla phrase segments in the manifest.
- [ ] (Deferred to v1.3) Add runtime tabla scheduler based on beat/phrase segments.
- [ ] (Deferred to v1.3) Add synced tabla bol display with sam, khali, tali, beat, BPM, and taal context.
- [ ] (v1.3 prep, parallel) Pitch-label open-access tabla bol samples with own pitch engine; prototype bol-sequenced theka engine; add attribution/credits screen.
- [ ] (Deferred to v1.3) Design tabla BPM controls with 1 BPM steps, 5 BPM steps, `x2`, `x/2`, and quick range movement.
- [ ] (Deferred to v1.3) Ensure tabla BPM selector exposes 10-700 BPM while only playing musically safe manifest-supported assets.
- [ ] Preserve v1.1 behavior where accompaniment can continue while users return to Riyaz visualization.
- [ ] Add piano/keyboard play-along mode planning and implementation path.
- [ ] Add Riyaz reference-note playback controls for selected swara/note.
- [ ] Choose initial reference instrument sound: piano, harmonium, electronic keyboard, or another clean sustained keyboard-like source.
- [ ] Support reference-note playback across all supported notes and user pitches without incorrect substitution.
- [ ] Decide whether reference-note playback can run with tanpura simultaneously or should be mutually exclusive in v1.2.
- [ ] Include session recording in v1.2 scope.
- [ ] Include recording sharing/export in v1.2 scope.
- [ ] Test offline on iPhone with airplane mode enabled.
- [ ] Test future Android behavior with network disabled.
- [ ] Compare optimized tanpura quality against v1.1 streamed masters.
- [ ] (Deferred to v1.3) Compare tabla quality against the iTablaPro-style benchmark.

## Additional v1.2 implementation notes

### Instrument play-along

Users should be able to connect or play an instrument alongside SwarPractice and use the app as a pitch/riyaz visualizer.

First target instrument family:

- piano,
- harmonium,
- electronic keyboard.

Planning questions:

- Which input route should ship first for piano/keyboard: phone microphone, wired audio interface, USB/MIDI keyboard input, or a combination?
- Should the pitch detector use a different sensitivity/profile for instruments versus voice?
- How should accompaniment bleed be handled when an instrument is louder than sung voice?
- Should instrument mode support swara display, western note display, or both?

### Session recording

Add the ability to record a practice session for user review.

Planning questions:

- Record microphone only, app accompaniment only, or mixed mic + accompaniment?
- Store recordings locally only by default?
- What recording format is best for iOS/Android/web: M4A/AAC, WAV, or platform-native format?
- How long can sessions be before storage becomes a problem?
- How does recording affect App Store privacy disclosures?

### Sharing recordings

Allow users to share recordings after a session.

Planning questions:

- Share audio only, or audio plus a practice summary image/report?
- Use native iOS/Android share sheets?
- Should shared files include pitch, taal, BPM, and score metadata?
- Should sharing be local-only with no SwarSaathi upload in v1.2?

## Open questions for v1.2

- Monetization/free/pro packaging for v1.2.
- If tabla recordings are pitch-specific, which tabla pitch centers should be included offline first?
- For piano/keyboard play-along, should v1.2 prioritize microphone audio detection, wired input, or MIDI input first?
- For session recording, should v1.2 record mic only or mixed mic + accompaniment?
- For sharing, should v1.2 share audio only or audio plus a summary card/report?

### Recommended defaults if implementation starts before these are revisited

- Keep v1.2 entitlement-ready but do not block the UI redesign on monetization; centralize future feature gates.
- Treat tabla pitch centers as a v1.3 decision.
- Use microphone detection for the first instrument play-along experiment; defer wired/MIDI-specific UX until validated.
- Record microphone only in v1.2, store locally, and clearly state that accompaniment is not embedded in the recording.
- Share audio through the native share sheet; defer generated summary cards and cloud upload.
- Default reference note and tanpura to mutually exclusive playback until microphone-bleed and learning tests prove simultaneous playback is useful.

## Future prompt to start implementation

Use this prompt when ready:

```text
Proceed with SwarSaathi/SwarPractice v1.2 from docs/V1_2-IMPLEMENTATION-PLAN.md. First audit the current implementation against the confirmed v1.2 scope, then execute in reviewable phases: (1) consumer information architecture, design system, and platform-specific app shells; (2) world-class homepage and business-development routes; (3) optimized offline tanpura pipeline; (4) Riyaz reference-note playback; (5) session recording and sharing; (6) onboarding, accessibility, privacy, analytics, performance, and real-device validation. Tabla accompaniment is deferred to v1.3. Do not manually chop audio; create repeatable preparation scripts and keep master recordings out of the shipped app bundle.
```
