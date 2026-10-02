#!/usr/bin/env bash
set -euo pipefail

app=artifacts/ios/native/rent.app
test "$(cat artifacts/ios/native/inputs.txt)" = "${RENT_IOS_NATIVE_CACHE_KEY:?Native input cache key is required}"
codesign --verify --strict "$app"
executable="$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$app/Info.plist")"
lipo "$app/$executable" -verify_arch "$(uname -m)"
codesign --display --entitlements :- "$app" > artifacts/ios/signing.log 2>&1
