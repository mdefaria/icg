#!/usr/bin/env bash
# Download Adobe's ZXPSignCmd into installers/tools/ and print its path.
# Adobe publishes it under github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD
# as per-platform binaries (dmg/zip/exe depending on version), so the URL is
# supplied by the caller (CI: repository variable ZXPSIGNCMD_URL_MACOS /
# ZXPSIGNCMD_URL_WINDOWS; locally: argument).
#
# Usage: fetch-zxpsigncmd.sh <url> [sha256]
set -euo pipefail

url="${1:-}"
expected_sha="${2:-}"
[ -n "$url" ] || { echo "usage: $0 <url> [sha256]" >&2; exit 2; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tools="$here/../tools"
mkdir -p "$tools"
tools="$(cd "$tools" && pwd)"
dl="$tools/download"
rm -rf "$dl"
mkdir -p "$dl"

file="$dl/$(basename "${url%%\?*}")"
curl -fsSL "$url" -o "$file"

if [ -n "$expected_sha" ]; then
  if command -v sha256sum >/dev/null; then actual="$(sha256sum "$file" | awk '{print $1}')"; else actual="$(shasum -a 256 "$file" | awk '{print $1}')"; fi
  [ "$actual" = "$expected_sha" ] || { echo "sha256 mismatch: $actual" >&2; exit 1; }
fi

target="$tools/ZXPSignCmd"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) target="$tools/ZXPSignCmd.exe" ;; esac

case "$file" in
  *.dmg)
    mount="$(hdiutil attach -nobrowse -readonly "$file" | awk -F'\t' '/\/Volumes\//{print $NF}')"
    found="$(find "$mount" -type f -name 'ZXPSignCmd*' -print -quit)"
    cp "$found" "$target"
    hdiutil detach "$mount" -quiet
    ;;
  *.zip)
    unzip -q "$file" -d "$dl/unzipped"
    found="$(find "$dl/unzipped" -type f -name 'ZXPSignCmd*' ! -name '*.txt' -print -quit)"
    cp "$found" "$target"
    ;;
  *)
    cp "$file" "$target"
    ;;
esac
chmod +x "$target"
# Not notarised by Adobe; macOS quarantines downloads and would refuse to run it.
if command -v xattr >/dev/null; then
  xattr -d com.apple.quarantine "$target" 2>/dev/null || true
fi
rm -rf "$dl"
echo "$target"
