#!/usr/bin/env bash
# Build the macOS installer: three component packages (Premiere panel,
# Resolve plugin, uninstaller) wrapped in a productbuild distribution with
# selectable choices, signed with Developer ID Installer, notarised and
# stapled. macOS only (pkgbuild, productbuild, productsign, notarytool).
#
# Usage:
#   build-pkg.sh --version 1.2.3 [--premiere DIR] [--resolve DIR] [--out DIR]
#                [--skip-sign] [--skip-notarize]
#   --premiere  signed CEP folder from common/sign-cep.sh
#               (default installers/build/cep/com.icg.premiere)
#   --resolve   Resolve plugin folder (default apps/resolve/dist)
# Env:
#   APPLE_DEVELOPER_ID_APPLICATION  "Developer ID Application: Name (TEAMID)"
#   APPLE_DEVELOPER_ID_INSTALLER    "Developer ID Installer: Name (TEAMID)"
#   One of, for notarytool:
#     NOTARY_KEYCHAIN_PROFILE
#     APP_STORE_CONNECT_KEY_P8_PATH + APP_STORE_CONNECT_KEY_ID + APP_STORE_CONNECT_ISSUER_ID
#     APPLE_ID + APPLE_TEAM_ID + APPLE_APP_SPECIFIC_PASSWORD
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$here/../.." && pwd)"

VERSION=""
PREMIERE_DIR="$repo_root/installers/build/cep/com.icg.premiere"
RESOLVE_DIR="$repo_root/apps/resolve/dist"
OUT="$repo_root/installers/build/macos"
SKIP_SIGN=0
SKIP_NOTARIZE=0

usage() { sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --premiere) PREMIERE_DIR="$2"; shift 2 ;;
    --resolve) RESOLVE_DIR="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --skip-sign) SKIP_SIGN=1; shift ;;
    --skip-notarize) SKIP_NOTARIZE=1; shift ;;
    -h|--help) usage ;;
    *) echo "unknown argument: $1" >&2; usage ;;
  esac
done

log() { printf '[build-pkg] %s\n' "$*"; }
die() { printf '[build-pkg] error: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "macOS only"
[ -n "$VERSION" ] || die "--version is required (e.g. 1.2.3)"
# pkgbuild rejects anything that is not dotted integers.
PKG_VERSION="$(printf '%s' "$VERSION" | sed -E 's/^v//; s/[-+].*$//')"
[[ "$PKG_VERSION" =~ ^[0-9]+(\.[0-9]+){0,2}$ ]] || die "version '$VERSION' does not start with a numeric x.y.z"
for tool in pkgbuild productbuild productsign pkgutil xcrun codesign; do
  command -v "$tool" >/dev/null || die "$tool not found (install Xcode command line tools)"
done

[ -d "$PREMIERE_DIR" ] || die "Premiere folder not found: $PREMIERE_DIR (run common/sign-cep.sh first)"
[ -f "$PREMIERE_DIR/META-INF/signatures.xml" ] || die "$PREMIERE_DIR is not a signed CEP folder (no META-INF/signatures.xml); run common/sign-cep.sh"
[ -f "$PREMIERE_DIR/mimetype" ] || die "$PREMIERE_DIR/mimetype missing; the installer must ship the ZXP contents unchanged"
[ -d "$RESOLVE_DIR" ] || die "Resolve plugin folder not found: $RESOLVE_DIR (build apps/resolve first)"
[ -f "$RESOLVE_DIR/manifest.xml" ] || die "$RESOLVE_DIR/manifest.xml missing; not a Workflow Integration plugin"

APP_ID="${APPLE_DEVELOPER_ID_APPLICATION:-}"
INSTALLER_ID="${APPLE_DEVELOPER_ID_INSTALLER:-}"
if [ "$SKIP_SIGN" = 0 ]; then
  [ -n "$APP_ID" ] || die "APPLE_DEVELOPER_ID_APPLICATION is empty (or pass --skip-sign for an unsigned local build)"
  [ -n "$INSTALLER_ID" ] || die "APPLE_DEVELOPER_ID_INSTALLER is empty (or pass --skip-sign)"
  security find-identity -v -p codesigning | grep -q "$APP_ID" || die "identity not in keychain: $APP_ID"
  security find-identity -v | grep -q "$INSTALLER_ID" || die "identity not in keychain: $INSTALLER_ID"
fi

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
work="$OUT/work"
rm -rf "$work"
mkdir -p "$work/roots" "$work/pkgs" "$work/resources"

PREMIERE_DEST="Library/Application Support/Adobe/CEP/extensions/com.icg.premiere"
RESOLVE_DEST="Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/com.icg.resolve"
ICG_DEST="Library/Application Support/ICG"

stage() {
  local src="$1" root="$2" dest="$3"
  mkdir -p "$root/$dest"
  cp -R "$src/." "$root/$dest/"
  find "$root" \( -name .DS_Store -o -name __MACOSX \) -prune -exec rm -rf {} +
}

log "staging payloads"
stage "$PREMIERE_DIR" "$work/roots/premiere" "$PREMIERE_DEST"
stage "$RESOLVE_DIR" "$work/roots/resolve" "$RESOLVE_DEST"
mkdir -p "$work/roots/common/$ICG_DEST"
cp "$here/uninstall.sh" "$work/roots/common/$ICG_DEST/uninstall.sh"
printf '%s\n' "$VERSION" > "$work/roots/common/$ICG_DEST/VERSION"
chmod 755 "$work/roots/common/$ICG_DEST/uninstall.sh"

is_macho() { file -b "$1" | grep -q 'Mach-O'; }

# The CEP payload is already ZXP-signed, so nothing in it may be modified
# here; any Mach-O inside must have been codesigned by sign-cep.sh.
while IFS= read -r -d '' f; do
  if is_macho "$f" && ! codesign --verify --strict "$f" 2>/dev/null; then
    die "unsigned Mach-O inside the CEP payload: $f. Re-run sign-cep.sh with --codesign-identity so it is signed before the ZXP."
  fi
done < <(find "$work/roots/premiere" -type f -print0)

if [ "$SKIP_SIGN" = 0 ]; then
  # Notarisation requires every Mach-O in the payload to carry a Developer ID
  # signature with hardened runtime and a secure timestamp. This includes
  # Blackmagic's WorkflowIntegration.node and any native node_modules.
  while IFS= read -r -d '' f; do
    if is_macho "$f"; then
      log "codesign $f"
      codesign --force --options runtime --timestamp --sign "$APP_ID" "$f"
    fi
  done < <(find "$work/roots/resolve" -type f -print0)
fi

build_component() {
  local name="$1" id="$2"
  log "pkgbuild $name"
  pkgbuild \
    --root "$work/roots/$name" \
    --identifier "$id" \
    --version "$PKG_VERSION" \
    --install-location / \
    --scripts "$here/scripts/$name" \
    --ownership recommended \
    "$work/pkgs/icg-$name.pkg" >/dev/null
}
build_component premiere com.icg.premiere.pkg
build_component resolve com.icg.resolve.pkg
build_component common com.icg.common.pkg

sed "s/@VERSION@/$PKG_VERSION/g" "$here/distribution.xml" > "$work/distribution.xml"
cp "$here/resources/"* "$work/resources/"

unsigned="$work/ICG-$VERSION-unsigned.pkg"
final="$OUT/ICG-$VERSION.pkg"
rm -f "$final"
log "productbuild"
productbuild \
  --distribution "$work/distribution.xml" \
  --resources "$work/resources" \
  --package-path "$work/pkgs" \
  --version "$PKG_VERSION" \
  "$unsigned" >/dev/null

if [ "$SKIP_SIGN" = 1 ]; then
  mv "$unsigned" "$final"
  log "unsigned package: $final (Gatekeeper will block it; local testing only)"
  exit 0
fi

log "productsign"
productsign --sign "$INSTALLER_ID" --timestamp "$unsigned" "$final" >/dev/null
pkgutil --check-signature "$final"

if [ "$SKIP_NOTARIZE" = 1 ]; then
  log "signed, not notarised: $final"
  exit 0
fi

notary_args=()
if [ -n "${NOTARY_KEYCHAIN_PROFILE:-}" ]; then
  notary_args=(--keychain-profile "$NOTARY_KEYCHAIN_PROFILE")
elif [ -n "${APP_STORE_CONNECT_KEY_P8_PATH:-}" ]; then
  notary_args=(--key "$APP_STORE_CONNECT_KEY_P8_PATH" --key-id "${APP_STORE_CONNECT_KEY_ID:?}" --issuer "${APP_STORE_CONNECT_ISSUER_ID:?}")
elif [ -n "${APPLE_ID:-}" ]; then
  notary_args=(--apple-id "$APPLE_ID" --team-id "${APPLE_TEAM_ID:?}" --password "${APPLE_APP_SPECIFIC_PASSWORD:?}")
else
  die "no notarytool credentials: set NOTARY_KEYCHAIN_PROFILE, APP_STORE_CONNECT_*, or APPLE_ID/APPLE_TEAM_ID/APPLE_APP_SPECIFIC_PASSWORD"
fi

log "notarytool submit --wait"
submit_log="$work/notary-submit.txt"
xcrun notarytool submit "$final" "${notary_args[@]}" --wait --timeout 30m | tee "$submit_log"
submission_id="$(grep -m1 -E '^\s*id:' "$submit_log" | awk '{print $2}')"
fetch_notary_log() {
  if [ -n "$submission_id" ]; then
    xcrun notarytool log "$submission_id" "${notary_args[@]}" "$1" || true
  fi
}
if ! grep -q 'status: Accepted' "$submit_log"; then
  fetch_notary_log "$work/notary-log.json"
  [ -f "$work/notary-log.json" ] && cat "$work/notary-log.json"
  die "notarisation did not return Accepted"
fi
# The log can carry warnings even when Accepted; keep it with the build.
fetch_notary_log "$OUT/ICG-$VERSION.notary-log.json"

log "stapler"
xcrun stapler staple "$final"
xcrun stapler validate "$final"
spctl --assess --type install -vv "$final"
log "done: $final"
