#!/bin/bash
# Copy the web app (../app) into www/ so it is bundled inside the APK — the app runs fully offline.
set -e
APP="$(cd "$(dirname "$0")" && pwd)"
SRC="${BAKI_SRC:-$APP/../app}"
rm -rf "$APP/www" && mkdir "$APP/www"
cp -r "$SRC"/. "$APP/www/"
# Firebase config (google-services.json) lives outside git; copy it in for every build.
GS="${BAKI_GOOGLE_SERVICES:-/workspace/keys/bakikhata-google-services.json}"
if [ -f "$GS" ]; then install -m 600 "$GS" "$APP/android/app/google-services.json"; else echo "WARN: $GS missing — cloud login will not work in this build" >&2; fi
