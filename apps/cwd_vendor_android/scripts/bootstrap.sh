#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Build only the Android scaffold; never modify the website's source files.
flutter create --platforms=android --project-name=cwd_vendor_android \
  --org com.carwithdriverindia --android-language kotlin --no-pub .

mkdir -p assets/images
if [[ -f ../../logo.png ]]; then
  cp ../../logo.png assets/images/cwd-logo.png
elif [[ ! -f assets/images/cwd-logo.png ]]; then
  echo "Missing CWD logo.png in repository root" >&2
  exit 1
fi

python3 scripts/configure_android.py
flutter pub get
dart run flutter_launcher_icons
