#!/bin/sh
# Xcode Cloud — install JS deps before SPM resolves Capacitor local packages.
# CapApp-SPM/Package.swift points at web/node_modules/@capacitor/{filesystem,share}.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "ci_post_clone: installing npm packages in $WEB_DIR"
cd "$WEB_DIR"
npm ci

if [ ! -d "node_modules/@capacitor/filesystem" ] || [ ! -d "node_modules/@capacitor/share" ]; then
  echo "ci_post_clone: missing Capacitor packages after npm ci" >&2
  ls -la node_modules/@capacitor || true
  exit 1
fi

echo "ci_post_clone: building web assets and syncing Capacitor iOS"
npm run build:mobile
npx cap sync ios

echo "ci_post_clone: done"
