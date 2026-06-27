#!/usr/bin/env bash
set -euo pipefail

BUCKET="${R2_BUCKET:-swarsaathi-audio}"
ROOT="${1:-web/audio/tanpura}"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required" >&2
  exit 1
fi

if [[ ! -d "$ROOT" ]]; then
  echo "Tanpura folder not found: $ROOT" >&2
  exit 1
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Set CLOUDFLARE_API_TOKEN first, then rerun." >&2
  exit 1
fi

clean_name() {
  local base="$1"
  case "$base" in
    "A (=55 Hz).mp3") echo "A1.mp3" ;;
    "D (~73.4 Hz).mp3") echo "D2.mp3" ;;
    "F (~87.3 Hz).mp3") echo "F2.mp3" ;;
    "F# (~92.5 Hz).mp3") echo "F-sharp2.mp3" ;;
    "G (~98 Hz).mp3") echo "G2.mp3" ;;
    "G# (~103.8 Hz).mp3") echo "G-sharp2.mp3" ;;
    "A (=110 Hz).mp3") echo "A2.mp3" ;;
    "A# (~116.5 Hz).mp3") echo "A-sharp2.mp3" ;;
    "B (~123.5 Hz).mp3") echo "B2.mp3" ;;
    "C (~130.8 Hz).mp3") echo "C3.mp3" ;;
    "C# (~138.6 Hz).mp3") echo "C-sharp3.mp3" ;;
    "D (~146.8 Hz).mp3") echo "D3.mp3" ;;
    "D# (~155.6 Hz).mp3") echo "D-sharp3.mp3" ;;
    "E (~164.8 Hz).mp3") echo "E3.mp3" ;;
    "F (~174.6 Hz).mp3") echo "F3.mp3" ;;
    *) echo "Unsupported tanpura file name: $base" >&2; return 1 ;;
  esac
}

for mode in Sa-Pa Sa-ma; do
  dir="$ROOT/$mode"
  if [[ ! -d "$dir" ]]; then
    echo "Skipping missing $dir"
    continue
  fi
  find "$dir" -maxdepth 1 -type f -iname '*.mp3' -print0 | while IFS= read -r -d '' file; do
    base="$(basename "$file")"
    clean="$(clean_name "$base")"
    key="tanpura/${mode}/${clean}"
    echo "Uploading $key from $base"
    npx --prefix web wrangler r2 object put "${BUCKET}/${key}" --file "$file" --content-type "audio/mpeg" --remote
  done
done
