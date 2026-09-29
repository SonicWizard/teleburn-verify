#!/usr/bin/env sh
# Render web/og/og.svg to the link-preview PNGs with headless Chrome, so no
# npm package or install script is needed. Run on macOS from the repo root:
#
#     sh scripts/render-og.sh
#
# When the card changes, bump OG_VERSION (and the og:image URLs in
# web/public/index.html) so LinkedIn, X and Slack fetch the new image.
set -eu

OG_VERSION=v1
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
SRC="$(pwd)/web/og/og.svg"

render() {
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="$1" \
    --screenshot="$2" "file://$SRC" 2>/dev/null
  echo "wrote $2 ($1)"
}

render 1200,630 "web/public/og-$OG_VERSION.png"
render 1280,640 "web/og/github-social-preview.png"
