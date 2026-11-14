#!/bin/bash
# text path then audio+text matrix. Run from es/tribe: nohup mac/finish_text.sh > mac/work/text.log 2>&1 &
cd "$(dirname "$0")/.."
.venv-mac/bin/python mac/run_text.py || exit 1
.venv-mac/bin/python mac/aggregate.py out/load_matrix.tribe_v2.mac.audio-text.json audio text || exit 1
.venv-mac/bin/python mac/validate.py out/load_matrix.tribe_v2.mac.audio-text.json > mac/work/spearman-audio-text.md
cp out/load_matrix.tribe_v2.mac.audio-text.json out/load_matrix.tribe_v2.mac.json
echo TEXT_DONE
