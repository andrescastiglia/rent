#!/usr/bin/env bash
set -euo pipefail

mkdir -p artifacts/ios/native
native_cache_key="${RENT_IOS_NATIVE_CACHE_KEY:?Native input cache key is required}"
app=artifacts/ios/native/rent.app
if [ "${RENT_IOS_BINARY_CACHE_HIT:-false}" = true ]; then
  test -d "$app"
  test "$(cat artifacts/ios/native/inputs.txt)" = "$native_cache_key"
  printf 'Reused simulator binary for native inputs %s\n' "$native_cache_key" > artifacts/ios/build.log
else
  workspace="$(find ios -maxdepth 1 -name '*.xcworkspace' -print -quit)"
  test -n "$workspace"
  workspace_name="$(basename "$workspace" .xcworkspace)"
  scheme="$(xcodebuild -list -json -workspace "$workspace" | node -e 'let value="";process.stdin.on("data",chunk=>value+=chunk);process.stdin.on("end",()=>{const schemes=JSON.parse(value).workspace.schemes;const expected=process.argv[1];if(!schemes.includes(expected))process.exit(1);process.stdout.write(expected);});' "$workspace_name")"
  xcodebuild -workspace "$workspace" -scheme "$scheme" -configuration Debug \
    -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath artifacts/ios/DerivedData \
    ARCHS="$(uname -m)" ONLY_ACTIVE_ARCH=YES \
    CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
    build > artifacts/ios/build.log 2>&1
  built_app="$(find artifacts/ios/DerivedData/Build/Products/Debug-iphonesimulator -maxdepth 1 -name '*.app' -print -quit)"
  test -n "$built_app"
  ditto "$built_app" "$app"
fi

printf '%s\n' "$native_cache_key" > artifacts/ios/native/inputs.txt
