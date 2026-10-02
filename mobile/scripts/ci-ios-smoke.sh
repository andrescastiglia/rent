#!/usr/bin/env bash
set -euo pipefail

mkdir -p artifacts/ios
simulator="$(xcrun simctl list devices available --json | node -e 'let value="";process.stdin.on("data",chunk=>value+=chunk);process.stdin.on("end",()=>{const devices=Object.values(JSON.parse(value).devices).flat();const device=devices.find(item=>item.name.startsWith("iPhone")&&item.isAvailable);if(!device)process.exit(1);process.stdout.write(device.udid);});')"
metro_pid=""
booted_here=false
cleanup() {
  if [ -n "$metro_pid" ]; then kill "$metro_pid" 2>/dev/null || true; fi
  if [ "$booted_here" = true ] && xcrun simctl list devices booted | grep -Fq "$simulator"; then
    xcrun simctl shutdown "$simulator" || true
  fi
}
trap cleanup EXIT
if ! xcrun simctl list devices booted | grep -Fq "$simulator"; then
  xcrun simctl boot "$simulator"
  booted_here=true
fi
xcrun simctl bootstatus "$simulator" -b

# Simulator AutoFill can replace a typed fixture password with its synthetic
# "Automatic Strong Password" cover. Use the same runtime preference as Appium;
# secure inputs, real keyboard events and exact-value assertions remain enabled.
xcrun simctl spawn "$simulator" defaults write com.apple.WebUI AutoFillPasswords -int 0
xcrun simctl spawn "$simulator" defaults read com.apple.WebUI AutoFillPasswords \
  > artifacts/ios/autofill-setting.txt
test "$(cat artifacts/ios/autofill-setting.txt)" = 0

npx expo start --localhost --port 8081 > artifacts/ios/metro.log 2>&1 &
metro_pid=$!
metro_ready=false
for _ in $(seq 1 60); do
  if curl --fail --silent --max-time 2 http://localhost:8081/status | grep -q 'packager-status:running'; then metro_ready=true; break; fi
  sleep 1
done
if [ "$metro_ready" != true ]; then
  tail -n 30 artifacts/ios/metro.log >&2
  exit 1
fi

app=artifacts/ios/native/rent.app
test -d "$app"
bundle_id="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist")"
# Xcode's local simulator signature supplies the app identity used by Keychain.
# An unsigned app launches, but SecureStore cannot persist its authenticated session.
codesign --verify --strict "$app"
codesign --display --entitlements :- "$app" > artifacts/ios/signing.log 2>&1
xcrun simctl install "$simulator" "$app"
xcrun simctl launch "$simulator" "$bundle_id" > artifacts/ios/launch.log
sleep 15
xcrun simctl spawn "$simulator" launchctl list > artifacts/ios/processes.log
grep -Fq "$bundle_id" artifacts/ios/processes.log
xcrun simctl io "$simulator" screenshot artifacts/ios/launch.png

DETOX_IOS_SIMULATOR_ID="$simulator" DETOX_IOS_BINARY="$app" \
  npx detox test -c ios.sim.debug --reuse --cleanup \
    --record-logs failing --take-screenshots all \
    --artifacts-location artifacts/ios/detox \
    > artifacts/ios/detox.log 2>&1
printf 'iOS native launch and complete Detox flows passed for %s\n' "$bundle_id" > artifacts/ios/result.txt
