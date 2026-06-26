#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNSIGNED="$ROOT/android/app/build/outputs/apk/release/app-release-unsigned.apk"
KEYSTORE="$ROOT/android/cpr-helper.keystore"
OUT="${1:-$ROOT/releases/cpr-helper.apk}"

if [ ! -f "$UNSIGNED" ]; then
  echo "Unsigned APK not found. Run: npm run apk:build" >&2
  exit 1
fi

if [ ! -f "$KEYSTORE" ]; then
  echo "Keystore not found at $KEYSTORE" >&2
  exit 1
fi

if [ -z "${ANDROID_HOME:-}" ]; then
  ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
fi

BUILD_TOOLS="$(ls -d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | tail -1)"
if [ -z "$BUILD_TOOLS" ] || [ ! -x "$BUILD_TOOLS/apksigner" ]; then
  echo "apksigner not found. Set ANDROID_HOME to your Android SDK." >&2
  exit 1
fi

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk}"
export PATH="$JAVA_HOME/bin:$BUILD_TOOLS:$PATH"

mkdir -p "$(dirname "$OUT")"
apksigner sign \
  --ks "$KEYSTORE" \
  --ks-pass pass:cprhelper \
  --key-pass pass:cprhelper \
  --ks-key-alias cprhelper \
  --out "$OUT" \
  "$UNSIGNED"
apksigner verify "$OUT"
echo "Signed APK: $OUT"
