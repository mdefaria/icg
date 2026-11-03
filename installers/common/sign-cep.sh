#!/usr/bin/env bash
# Produce a signed, timestamped ZXP of the Premiere CEP extension and the
# extracted signed folder the installers ship. Runs on macOS, Linux and
# Git Bash on Windows; needs ZXPSignCmd (Adobe) on PATH or in $ZXPSIGNCMD.
#
# Usage:
#   sign-cep.sh [--src DIR] [--out DIR] [--cert FILE.p12] [--tsa URL]...
#               [--codesign-identity "Developer ID Application: ..."]
#               [--self-signed-dev]
# Env:
#   ZXPSIGNCMD                 path to the ZXPSignCmd binary (default: on PATH)
#   CEP_SIGNING_CERT_P12       path to the .p12 (overridden by --cert)
#   CEP_SIGNING_CERT_PASSWORD  password of the .p12 (required)
set -euo pipefail

BUNDLE_ID="com.icg.premiere"
SRC=""
OUT=""
CERT="${CEP_SIGNING_CERT_P12:-}"
PASSWORD="${CEP_SIGNING_CERT_PASSWORD:-}"
CODESIGN_IDENTITY=""
SELF_SIGNED_DEV=0
TSAS=()

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$here/../.." && pwd)"

usage() { sed -n '2,14p' "${BASH_SOURCE[0]}"; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --src) SRC="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --cert) CERT="$2"; shift 2 ;;
    --tsa) TSAS+=("$2"); shift 2 ;;
    --codesign-identity) CODESIGN_IDENTITY="$2"; shift 2 ;;
    --self-signed-dev) SELF_SIGNED_DEV=1; shift ;;
    -h|--help) usage ;;
    *) echo "unknown argument: $1" >&2; usage ;;
  esac
done

SRC="${SRC:-$repo_root/apps/premiere/dist}"
OUT="${OUT:-$repo_root/installers/build/cep}"
# DigiCert is the TSA the CEP community settled on after GeoTrust's shut down
# (Adobe-CEP/CEP-Resources#115); the other two are Adobe's documented examples.
if [ ${#TSAS[@]} -eq 0 ]; then
  TSAS=("http://timestamp.digicert.com/" "http://time.certum.pl/" "http://timestamp.comodoca.com/rfc3161")
fi

log() { printf '[sign-cep] %s\n' "$*"; }
die() { printf '[sign-cep] error: %s\n' "$*" >&2; exit 1; }

ZXP="${ZXPSIGNCMD:-$(command -v ZXPSignCmd || command -v ZXPSignCmd.exe || true)}"
{ [ -n "$ZXP" ] && [ -x "$ZXP" ]; } || die "ZXPSignCmd not found; set ZXPSIGNCMD (see installers/README.md)"
[ -d "$SRC" ] || die "source folder not found: $SRC (build apps/premiere first)"
[ -f "$SRC/CSXS/manifest.xml" ] || die "$SRC/CSXS/manifest.xml missing; not a CEP extension"
grep -q "ExtensionBundleId=\"$BUNDLE_ID\"" "$SRC/CSXS/manifest.xml" \
  || die "CSXS/manifest.xml does not declare ExtensionBundleId=\"$BUNDLE_ID\""

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
staging="$OUT/staging/$BUNDLE_ID"
zxp_file="$OUT/$BUNDLE_ID.zxp"
extracted="$OUT/$BUNDLE_ID"
rm -rf "$OUT/staging" "$zxp_file" "$extracted"
mkdir -p "$staging"

log "staging $SRC"
cp -R "$SRC/." "$staging/"
# A .debug file marks a development build; ZXPSignCmd refuses it and the
# host ignores it anyway. Finder droppings break signature checks.
find "$staging" \( -name .debug -o -name .DS_Store -o -name __MACOSX -o -name Thumbs.db \) -prune -exec rm -rf {} +
if find "$staging" -type l -print -quit | grep -q .; then
  die "symlinks in the extension break ZXP signature checks (CEP-Resources KnownIssue2024); replace them with files"
fi

if [ -n "$CODESIGN_IDENTITY" ]; then
  # Any Mach-O inside the CEP folder must be codesigned BEFORE the ZXP is
  # signed: codesign rewrites the binary, which would invalidate the ZXP hash.
  command -v codesign >/dev/null || die "--codesign-identity given but codesign is not available (macOS only)"
  while IFS= read -r -d '' f; do
    if file -b "$f" | grep -q 'Mach-O'; then
      log "codesign $f"
      codesign --force --options runtime --timestamp --sign "$CODESIGN_IDENTITY" "$f"
    fi
  done < <(find "$staging" -type f -print0)
fi

if [ -z "$CERT" ]; then
  if [ "$SELF_SIGNED_DEV" = 1 ]; then
    CERT="$OUT/dev-selfsigned.p12"
    PASSWORD="${PASSWORD:-icg-dev}"
    log "creating throwaway self-signed certificate $CERT (dev only)"
    "$ZXP" -selfSignedCert GB London ICG "ICG dev" "$PASSWORD" "$CERT" -validityDays 3650
  else
    die "no certificate: pass --cert, set CEP_SIGNING_CERT_P12, or use --self-signed-dev"
  fi
fi
[ -f "$CERT" ] || die "certificate not found: $CERT"
[ -n "$PASSWORD" ] || die "CEP_SIGNING_CERT_PASSWORD is empty"

signed=0
for tsa in "${TSAS[@]}"; do
  log "signing with TSA $tsa"
  if "$ZXP" -sign "$staging" "$zxp_file" "$CERT" "$PASSWORD" -tsa "$tsa"; then
    signed=1
    break
  fi
  log "TSA $tsa failed, trying the next one"
  rm -f "$zxp_file"
done
# Never fall back to an untimestamped signature: Adobe's table says an
# expired certificate without a timestamp stops the extension loading.
[ "$signed" = 1 ] || die "signing failed with every TSA"

log "verifying $zxp_file"
"$ZXP" -verify "$zxp_file" -certinfo

log "extracting signed folder to $extracted"
mkdir -p "$extracted"
if command -v unzip >/dev/null; then
  unzip -q "$zxp_file" -d "$extracted"
elif command -v 7z >/dev/null; then
  7z x -y -o"$extracted" "$zxp_file" >/dev/null
else
  tar -xf "$zxp_file" -C "$extracted"
fi

for required in mimetype META-INF/signatures.xml CSXS/manifest.xml; do
  [ -f "$extracted/$required" ] || die "extracted folder is missing $required"
done
grep -q 'application/vnd.adobe.air-ucf-package+zip' "$extracted/mimetype" \
  || die "mimetype content unexpected: $(cat "$extracted/mimetype")"

log "verifying extracted folder"
"$ZXP" -verify "$extracted"

rm -rf "$OUT/staging"
log "done"
log "  zxp:    $zxp_file"
log "  folder: $extracted"
