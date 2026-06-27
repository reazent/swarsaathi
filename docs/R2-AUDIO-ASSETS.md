# R2 audio assets for SwarSaathi

Large accompaniment audio should live in Cloudflare R2/CDN, not inside the iOS app bundle. The tanpura folders are currently about 1.5 GB total, so bundling them would make the app too large.

## Target URL shape

The app expects tanpura files at:

```text
https://assets.swarsaathi.com/tanpura/Sa-Pa/C3.mp3
https://assets.swarsaathi.com/tanpura/Sa-ma/C3.mp3
```

`web/js/milap.js` uses this default base URL:

```text
https://assets.swarsaathi.com
```

For local testing, you can override it in the browser console before loading SwarPractice:

```js
window.SWARSAATHI_AUDIO_BASE_URL = "https://your-test-host.example.com";
```

## Cloudflare setup still needed

### 1. R2 bucket

Create or confirm this bucket:

```text
swarsaathi-audio
```

### 2. API token for upload

Create a Cloudflare API token with permission to write R2 objects.

Minimum practical token:

- Account: your Cloudflare account
- Permissions: R2 Storage / Object Read & Write, or R2 edit/write if the dashboard uses broader labels
- Scope: limit to the `swarsaathi-audio` bucket if Cloudflare allows bucket scoping

Set it temporarily in your terminal before upload:

```bash
export CLOUDFLARE_API_TOKEN="paste_token_here"
export R2_BUCKET="swarsaathi-audio"
```

Do not commit this token.

Important: Wrangler must use `--remote` for R2 object commands. Without `--remote`, it may write to local R2 simulation instead of Cloudflare.

### 3. Upload tanpura files

From the repo root:

```bash
cd /Users/sumit/Projects/indian-pitch
./scripts/upload-tanpura-r2.sh
```

The script uploads local files from:

```text
web/audio/tanpura/Sa-Pa/
web/audio/tanpura/Sa-ma/
```

to R2 keys:

```text
tanpura/Sa-Pa/C3.mp3
tanpura/Sa-Pa/C-sharp3.mp3
tanpura/Sa-ma/C3.mp3
tanpura/Sa-ma/C-sharp3.mp3
...
```

### 4. Public delivery domain

Configure a public domain for R2 assets:

```text
assets.swarsaathi.com
```

Recommended Cloudflare path:

1. Cloudflare Dashboard -> R2 -> `swarsaathi-audio`.
2. Settings -> Public access / Custom domains.
3. Connect `assets.swarsaathi.com` to the bucket.
4. Let Cloudflare create the DNS record.
5. Confirm HTTPS is active.

If Cloudflare requires a route/path for the whole bucket, use the bucket root and keep object keys under `tanpura/...`.

### 5. CORS

If browser playback from the web app is blocked, add CORS for the asset domain/bucket:

Allowed origins:

```text
https://swarsaathi.com
https://www.swarsaathi.com
capacitor://localhost
http://localhost
```

Allowed methods:

```text
GET
HEAD
```

Allowed headers:

```text
*
```

### 6. Verify object URLs

Test one file after upload. Example:

```bash
curl -I "https://assets.swarsaathi.com/tanpura/Sa-Pa/C3.mp3"
```

Expected:

```text
HTTP/2 200
content-type: audio/mpeg
```

## Build behavior

`web/scripts/build-mobile.mjs` now copies small `web/audio` assets but intentionally skips:

```text
web/audio/tanpura/
```

This keeps `web/dist` and the iOS app bundle small.

## Future optimization

The current uploaded files are high quality but large. Before wide release, consider:

- trimming loop duration,
- re-encoding to efficient AAC/MP3 bitrate,
- keeping only popular pitches in the app cache,
- using R2 + Cache Reserve / CDN caching for delivery.


## Tanpura filename mapping

Use octave-specific R2 keys so the app selects the recording that matches the actual loop frequency:

| Loop recording | R2 key | Pitch label |
| --- | --- | --- |
| `A (=55 Hz).mp3` | `A1.mp3` | A1 |
| `D (~73.4 Hz).mp3` | `D2.mp3` | D2 |
| `F (~87.3 Hz).mp3` | `F2.mp3` | F2 |
| `F# (~92.5 Hz).mp3` | `F-sharp2.mp3` | F#2 |
| `G (~98 Hz).mp3` | `G2.mp3` | G2 |
| `G# (~103.8 Hz).mp3` | `G-sharp2.mp3` | G#2 |
| `A (=110 Hz).mp3` | `A2.mp3` | A2 |
| `A# (~116.5 Hz).mp3` | `A-sharp2.mp3` | A#2 |
| `B (~123.5 Hz).mp3` | `B2.mp3` | B2 |
| `C (~130.8 Hz).mp3` | `C3.mp3` | C3 |
| `C# (~138.6 Hz).mp3` | `C-sharp3.mp3` | C#3 |
| `D (~146.8 Hz).mp3` | `D3.mp3` | D3 |
| `D# (~155.6 Hz).mp3` | `D-sharp3.mp3` | D#3 |
| `E (~164.8 Hz).mp3` | `E3.mp3` | E3 |
| `F (~174.6 Hz).mp3` | `F3.mp3` | F3 |
