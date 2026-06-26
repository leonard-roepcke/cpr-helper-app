#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
APK_NAME="cpr-helper-v${VERSION}.apk"
APK_PATH="$ROOT/releases/$APK_NAME"
TAG="v${VERSION}"
TITLE="v${VERSION}"
NOTES="${1:-Release v${VERSION}}"

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"

echo "==> Building signed APK for ${VERSION}"
npm run apk:build
bash scripts/sign-apk.sh "$APK_PATH"

if ! apksigner verify "$APK_PATH" >/dev/null 2>&1; then
  echo "APK verification failed: $APK_PATH" >&2
  exit 1
fi

echo "==> Committing and tagging ${TAG}"
git add -A
if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "$(cat <<EOF
Release ${TAG}.

${NOTES}
EOF
)"
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag ${TAG} already exists."
else
  git tag "$TAG"
fi

echo "==> Pushing to GitHub"
git push origin main
git push origin "$TAG"

echo "==> Creating GitHub release"
if gh release view "$TAG" >/dev/null 2>&1; then
  gh release upload "$TAG" "$APK_PATH#${APK_NAME}" --clobber
else
  gh release create "$TAG" "$APK_PATH#${APK_NAME}" \
    --title "$TITLE" \
    --notes "$NOTES"
fi

echo "Done: https://github.com/leonard-roepcke/cpr-helper-app/releases/tag/${TAG}"
