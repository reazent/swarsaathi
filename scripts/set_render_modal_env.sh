#!/usr/bin/env bash
# Add/update Modal song env vars on the Render API service (does NOT wipe other vars).
# Requires: RENDER_API_KEY from https://dashboard.render.com/u/settings#api-keys
# Optional: RENDER_SERVICE_ID (otherwise looks up service named swarsaathi-api)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
set -a
source "$ROOT/.env"
set +a

: "${RENDER_API_KEY:?Set RENDER_API_KEY in the environment or .env (Render → Account Settings → API Keys)}"
: "${MODAL_TOKEN_ID:?MODAL_TOKEN_ID missing from .env}"
: "${MODAL_TOKEN_SECRET:?MODAL_TOKEN_SECRET missing from .env}"
MODAL_ACE_AUDIO_URL="${MODAL_ACE_AUDIO_URL:-https://sumitv77--sargam-ace-audio.modal.run}"
SARGAM_SONG_PROVIDER="${SARGAM_SONG_PROVIDER:-auto}"

AUTH="Authorization: Bearer ${RENDER_API_KEY}"
API="https://api.render.com/v1"

if [[ -z "${RENDER_SERVICE_ID:-}" ]]; then
  RENDER_SERVICE_ID="$(
    curl -fsS -H "$AUTH" -H "Accept: application/json" "$API/services?limit=50" \
      | python3 -c '
import json,sys
rows=json.load(sys.stdin)
for row in rows:
  svc=row.get("service") or row
  name=svc.get("name") or ""
  url=((svc.get("serviceDetails") or {}).get("url") or "")
  if name=="swarsaathi-api" or url.rstrip("/").endswith("swarsaathi-api.onrender.com"):
    print(svc["id"]); break
'
  )"
fi
: "${RENDER_SERVICE_ID:?Could not find Render service swarsaathi-api; set RENDER_SERVICE_ID}"

put_var() {
  local key="$1" value="$2"
  curl -fsS -X PUT \
    -H "$AUTH" \
    -H "Accept: application/json" \
    -H "Content-Type: application/json" \
    "$API/services/${RENDER_SERVICE_ID}/env-vars/${key}" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"value": sys.argv[1]}))' "$value")" \
    >/dev/null
  echo "  set ${key}"
}

echo "Updating Modal env on service ${RENDER_SERVICE_ID}..."
put_var MODAL_TOKEN_ID "$MODAL_TOKEN_ID"
put_var MODAL_TOKEN_SECRET "$MODAL_TOKEN_SECRET"
put_var MODAL_ACE_AUDIO_URL "$MODAL_ACE_AUDIO_URL"
put_var SARGAM_SONG_PROVIDER "$SARGAM_SONG_PROVIDER"

echo "Triggering deploy..."
curl -fsS -X POST \
  -H "$AUTH" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  "$API/services/${RENDER_SERVICE_ID}/deploys" \
  -d '{"clearCache":"do_not_clear"}' >/dev/null

echo "Done. Watch: https://dashboard.render.com/web/${RENDER_SERVICE_ID}"
echo "Health: https://swarsaathi-api.onrender.com/health  (expect config.modal_song=true)"
