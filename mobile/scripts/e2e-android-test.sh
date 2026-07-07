#!/bin/sh
set -eu

METRO_LOG="${METRO_LOG:-/tmp/rent-metro-e2e.log}"
LOGCAT_LOG="${LOGCAT_LOG:-/tmp/rent-e2e-logcat.log}"
DETOX_ARTIFACTS="${DETOX_ARTIFACTS:-/tmp/rent-detox-artifacts}"
BUNDLE_URL="http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false"
BUNDLE_OUT="/tmp/rent-e2e-entry.bundle"
LOGCAT_PID=""

rm -rf "$DETOX_ARTIFACTS"
rm -f "$METRO_LOG" "$LOGCAT_LOG" "$BUNDLE_OUT"

EXPO_PUBLIC_MOCK_MODE=true EXPO_PUBLIC_E2E_MODE=true \
  ./node_modules/.bin/metro serve \
  --host 127.0.0.1 \
  --port 8081 \
  --reset-cache \
  --config metro.config.js \
  >"$METRO_LOG" 2>&1 &
METRO_PID=$!

cleanup() {
  kill "$METRO_PID" 2>/dev/null || true
  if [ -n "$LOGCAT_PID" ]; then
    kill "$LOGCAT_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

for _ in $(seq 1 150); do
  HTTP_CODE="$(curl -sS -o "$BUNDLE_OUT" -w '%{http_code}' "$BUNDLE_URL" 2>/dev/null || true)"
  if [ "$HTTP_CODE" = "200" ]; then
    break
  fi
  sleep 2
done

HTTP_CODE="$(curl -sS -o "$BUNDLE_OUT" -w '%{http_code}' "$BUNDLE_URL" 2>/dev/null || true)"
if [ "$HTTP_CODE" != "200" ]; then
  echo "Metro did not build the Android entry bundle within 5 minutes; last HTTP status: $HTTP_CODE"
  cat "$METRO_LOG"
  if [ -s "$BUNDLE_OUT" ]; then
    cat "$BUNDLE_OUT"
  fi
  exit 1
fi

adb wait-for-device
adb logcat -c >/dev/null 2>&1 || true
adb logcat -v time >"$LOGCAT_LOG" 2>&1 &
LOGCAT_PID=$!

EXPO_PUBLIC_MOCK_MODE=true EXPO_PUBLIC_E2E_MODE=true \
  detox test -c android.emu.debug \
    --cleanup \
    --record-logs failing \
    --take-screenshots failing \
    --artifacts-location "$DETOX_ARTIFACTS" \
    --loglevel verbose || {
  echo "Detox failed; last Metro lines:"
  tail -n 200 "$METRO_LOG" || true
  echo "Detox failed; relevant Android logcat lines:"
  grep -E "AndroidRuntime|FATAL EXCEPTION|ReactNativeJS|Detox|SoLoader|com\\.acastiglia\\.rentmobile|com\\.maese\\.rent|Expo|ReactNative|Metro|Exception|Error" "$LOGCAT_LOG" | tail -n 300 || true
  echo "Detox failed; artifact files:"
  find "$DETOX_ARTIFACTS" -type f -maxdepth 4 -print 2>/dev/null || true
  exit 1
}
