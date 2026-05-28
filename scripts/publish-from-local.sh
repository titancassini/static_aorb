#!/usr/bin/env bash
# Sync Simply Static export into this repo and push to GitHub.
# GitHub Actions then pins to Pinata and updates Cloudflare DNSLink.
set -euo pipefail

SITE_ROOT="/home/delegate0x/Local Sites/a-or-b"
REPO="/home/delegate0x/Documents/dev/static_aorb"
EXPORT_DIR="${STATIC_EXPORT_DIR:-$SITE_ROOT/static-export}"
TEMP_EXPORT="$SITE_ROOT/app/public/wp-content/uploads/simply-static/temp-files"

find_export_dir() {
  if [[ -f "$EXPORT_DIR/index.html" ]]; then
    echo "$EXPORT_DIR"
    return 0
  fi

  local latest
  latest="$(find "$TEMP_EXPORT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)"
  if [[ -n "${latest:-}" && -f "$latest/index.html" ]]; then
    echo "$latest"
    return 0
  fi

  return 1
}

SOURCE="$(find_export_dir)" || {
  echo "No static export found."
  echo "Run Simply Static export first, or set STATIC_EXPORT_DIR."
  exit 1
}

echo "Publishing from: $SOURCE"
echo "Into repo:       $REPO"

rsync -a --delete \
  --exclude='.git/' \
  --exclude='.github/' \
  --exclude='scripts/' \
  --exclude='README.md' \
  --exclude='LICENSE' \
  --exclude='_redirects' \
  --exclude='.gitignore' \
  "$SOURCE/" "$REPO/"

cd "$REPO"

if git diff --quiet && git diff --cached --quiet; then
  echo "No changes to publish."
  exit 0
fi

git add -A
git status --short
git commit -m "Publish static site $(date -Iseconds)"
git push origin HEAD

echo "Pushed. GitHub Actions will pin to IPFS and update DNSLink."
