#!/usr/bin/env bash
set -euo pipefail

mkdir -p artifacts/ios
workspace="$(find ios -maxdepth 1 -name '*.xcworkspace' -print -quit)"
test -n "$workspace"
workspace_name="$(basename "$workspace" .xcworkspace)"
scheme="$(xcodebuild -list -json -workspace "$workspace" | node -e 'let value="";process.stdin.on("data",chunk=>value+=chunk);process.stdin.on("end",()=>{const schemes=JSON.parse(value).workspace.schemes;const expected=process.argv[1];if(!schemes.includes(expected)){process.stderr.write(`Expected application scheme ${expected}; available: ${schemes.join(", ")}\n`);process.exit(1);}process.stdout.write(expected);});' "$workspace_name")"
xcodebuild -workspace "$workspace" -scheme "$scheme" -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath artifacts/ios/DerivedData CODE_SIGNING_ALLOWED=NO \
  build > artifacts/ios/build.log 2>&1

simulator="$(xcrun simctl list devices available --json | node -e 'let value="";process.stdin.on("data",chunk=>value+=chunk);process.stdin.on("end",()=>{const devices=Object.values(JSON.parse(value).devices).flat();const device=devices.find(item=>item.name.startsWith("iPhone")&&item.isAvailable);if(!device)process.exit(1);process.stdout.write(device.udid);});')"
metro_pid=""
booted_here=false
cleanup() {
  if [ -n "$metro_pid" ]; then kill "$metro_pid" 2>/dev/null || true; fi
  if [ "$booted_here" = true ]; then xcrun simctl shutdown "$simulator" || true; fi
}
trap cleanup EXIT
if ! xcrun simctl list devices booted | grep -Fq "$simulator"; then
  xcrun simctl boot "$simulator"
  booted_here=true
fi
xcrun simctl bootstatus "$simulator" -b

npx expo start --localhost --port 8081 > artifacts/ios/metro.log 2>&1 &
metro_pid=$!
metro_ready=false
for _ in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:8081/status | grep -q 'packager-status:running'; then metro_ready=true; break; fi
  sleep 1
done
test "$metro_ready" = true

app="$(find artifacts/ios/DerivedData/Build/Products/Debug-iphonesimulator -maxdepth 1 -name '*.app' -print -quit)"
test -n "$app"
bundle_id="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist")"
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
