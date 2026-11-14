#!/usr/bin/env bash
# Resets the three synthetic demo patients to their initial state (run before a show).
API="http://127.0.0.1:${ES_API_PORT:-8000}"
out="$(curl -s --max-time 10 -X POST "$API/demo/reset")" || { echo "API is not reachable at $API" >&2; exit 1; }
echo "$out"
