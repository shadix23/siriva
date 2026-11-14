#!/usr/bin/env bash
# Starts Siriva for a live demo: API (FastAPI) + web (Next.js), waits until the speech model is warm,
# resets the demo data, prints the addresses. Ctrl+C stops both processes.
#   ES_API_PORT (8000), ES_WEB_PORT (3000), ES_LOAD_MATRIX (path to a TRIBE v2 matrix), ES_WHISPER_MODEL,
#   ES_SKIP_WEB=1 (API only, e.g. when web runs elsewhere)
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
# TRIBE v2 hybrid matrix is used by default when present (override with ES_LOAD_MATRIX)
if [ -z "${ES_LOAD_MATRIX:-}" ] && [ -f "$ROOT/tribe/out/load_matrix.hybrid.json" ]; then export ES_LOAD_MATRIX="$ROOT/tribe/out/load_matrix.hybrid.json"; fi
API_PORT="${ES_API_PORT:-8000}"
WEB_PORT="${ES_WEB_PORT:-3000}"
API="http://127.0.0.1:${API_PORT}"
LOGS="${TMPDIR:-/tmp}/es-demo-logs"
mkdir -p "$LOGS"
PY="$ROOT/backend/.venv/bin/python"

fail() { echo "ERROR: $*" >&2; exit 1; }
[ -x "$PY" ] || fail "no backend venv. Run: cd $ROOT/backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
command -v npm >/dev/null || fail "npm not found"
PORTS="$API_PORT"; [ "${ES_SKIP_WEB:-0}" = "1" ] || PORTS="$API_PORT $WEB_PORT"
for p in $PORTS; do
  lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 && fail "port $p is busy (stop the old process or set ES_API_PORT / ES_WEB_PORT)"
done

set -m  # every background job gets its own process group, so Ctrl+C can stop the whole tree
API_PID=""; WEB_PID=""
cleanup() {
  trap - INT TERM EXIT
  echo; echo "Stopping Siriva..."
  for pid in $WEB_PID $API_PID; do
    [ -n "$pid" ] && kill -TERM -- "-$pid" 2>/dev/null
  done
  sleep 1
  for pid in $WEB_PID $API_PID; do
    [ -n "$pid" ] && kill -KILL -- "-$pid" 2>/dev/null
  done
  exit 0
}
trap cleanup INT TERM EXIT

# API (model warm-up starts right away in the background)
cd "$ROOT/backend"
ES_API_PORT="$API_PORT" "$PY" -m es_api >"$LOGS/api.log" 2>&1 &
API_PID=$!

if [ "${ES_SKIP_WEB:-0}" != "1" ]; then
# web: build when there is no build or sources are newer than it
  cd "$ROOT/web"
  [ -d node_modules ] || { echo "npm install..."; npm install >"$LOGS/npm-install.log" 2>&1 || fail "npm install failed, see $LOGS/npm-install.log"; }
  if [ ! -f .next/BUILD_ID ] || [ -n "$(find src public package.json next.config.ts -newer .next/BUILD_ID -print -quit 2>/dev/null)" ]; then
    echo "Building web (npm run build)..."
    ES_API_ORIGIN="$API" npm run build >"$LOGS/web-build.log" 2>&1 || fail "web build failed, see $LOGS/web-build.log"
  fi
  npm run start -- -p "$WEB_PORT" >"$LOGS/web.log" 2>&1 &
  WEB_PID=$!
  
fi

echo "Waiting for the API and the speech model (first start can take a minute)..."
ready=""
for i in $(seq 1 240); do
  kill -0 "$API_PID" 2>/dev/null || { tail -20 "$LOGS/api.log"; fail "API exited, log: $LOGS/api.log"; }
  out="$(curl -s --max-time 2 "$API/health" 2>/dev/null || true)"
  if [ -n "$out" ]; then
    state="$(printf '%s' "$out" | "$PY" -c 'import sys,json; d=json.load(sys.stdin); print(d.get("transcriber_state","?"), d.get("transcriber_ready"), d.get("research_classifier_state","disabled"))' 2>/dev/null || echo "? ? ?")"
    case "$state" in
      error*) tail -20 "$LOGS/api.log"; fail "speech model failed to warm up, log: $LOGS/api.log" ;;
      *"True ready"|*"True disabled"|*"True error") ready=1; break ;;
    esac
  fi
  sleep 1
done
[ -n "$ready" ] || fail "speech model and research classifier were not ready in 4 minutes, log: $LOGS/api.log"

if [ "${ES_SKIP_WEB:-0}" != "1" ]; then
for i in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:${WEB_PORT}/" 2>/dev/null)" = "200" ] && break
    sleep 1
  done
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${WEB_PORT}/")" = "200" ] || fail "web does not answer, log: $LOGS/web.log"
  
fi

curl -s -X POST "$API/demo/reset" >/dev/null && echo "Demo data reset."
echo
echo "Siriva is ready."
[ "${ES_SKIP_WEB:-0}" = "1" ] || echo "  App:        http://127.0.0.1:${WEB_PORT}"
echo "  API:        $API   (docs: $API/docs)"
echo "  Health:     $(curl -s "$API/health")"
[ -n "${ES_LOAD_MATRIX:-}" ] && echo "  Load matrix: $ES_LOAD_MATRIX"
echo "  Logs:       $LOGS"
echo "  Reset demo: $ROOT/reset-demo.sh"
echo "Ctrl+C stops everything."
wait
