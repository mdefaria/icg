#!/bin/bash
# ICG uninstaller. Installed by the ICG .pkg at
# /Library/Application Support/ICG/uninstall.sh and run with sudo.
#
# Usage: sudo /Library/Application\ Support/ICG/uninstall.sh [-y]
set -euo pipefail

PREMIERE_DIR="/Library/Application Support/Adobe/CEP/extensions/com.icg.premiere"
RESOLVE_DIR="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/com.icg.resolve"
ICG_DIR="/Library/Application Support/ICG"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo \"$0\"" >&2
  exit 1
fi

assume_yes=0
[ "${1:-}" = "-y" ] && assume_yes=1

echo "This removes ICG from Premiere Pro and DaVinci Resolve Studio:"
[ -d "$PREMIERE_DIR" ] && echo "  $PREMIERE_DIR"
[ -d "$RESOLVE_DIR" ] && echo "  $RESOLVE_DIR"
echo "  $ICG_DIR"
if [ "$assume_yes" -ne 1 ]; then
  read -r -p "Continue? [y/N] " answer
  case "$answer" in y|Y|yes|YES) ;; *) echo "Cancelled."; exit 0 ;; esac
fi

rm -rf "$PREMIERE_DIR" "$RESOLVE_DIR"
for id in com.icg.premiere.pkg com.icg.resolve.pkg com.icg.common.pkg; do
  pkgutil --forget "$id" >/dev/null 2>&1 || true
done
rm -rf "$ICG_DIR"
echo "ICG removed. Restart Premiere Pro and DaVinci Resolve if they are open."
