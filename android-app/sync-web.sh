#!/bin/bash
# Copy the web app (../app) into www/ so it is bundled inside the APK — the app runs fully offline.
set -e
APP="$(cd "$(dirname "$0")" && pwd)"
SRC="${BAKI_SRC:-$APP/../app}"
rm -rf "$APP/www" && mkdir "$APP/www"
cp -r "$SRC"/. "$APP/www/"
