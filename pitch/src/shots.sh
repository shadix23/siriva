#!/bin/bash
# PNG preview of every slide via headless Chrome (does not touch the user's browser windows).
cd "$(dirname "$0")/.." || exit 1
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMPD="${TMPDIR:-/tmp}/es-pitch-chrome"
mkdir -p preview
for i in $(seq -w 1 11); do
  "$CH" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$TMPD" --window-size=1600,900 \
    --virtual-time-budget=3000 --screenshot="preview/slide-$i.png" "file://$PWD/Siriva-pitch.html?s=$i" >/dev/null 2>&1
done
ls preview
