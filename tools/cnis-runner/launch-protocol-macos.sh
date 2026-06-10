#!/bin/sh
set -u

URL="${1:-}"
RUNNER_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PORT="${WIZZY_CNIS_RUNNER_PORT:-8787}"
BASE_URL="http://127.0.0.1:${PORT}"

is_runner_online() {
  curl -fsS --max-time 1 "${BASE_URL}/health" >/dev/null 2>&1
}

wait_runner() {
  deadline=$(( $(date +%s) + 25 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if is_runner_online; then
      return 0
    fi
    sleep 0.7
  done
  return 1
}

start_runner() {
  OUT_LOG="${RUNNER_ROOT}/cnis-runner.out.log"
  ERR_LOG="${RUNNER_ROOT}/cnis-runner.err.log"
  SERVER="${RUNNER_ROOT}/src/server.js"

  if [ -x "${RUNNER_ROOT}/runtime/node" ]; then
    NODE="${RUNNER_ROOT}/runtime/node"
  elif [ -x "${RUNNER_ROOT}/node" ]; then
    NODE="${RUNNER_ROOT}/node"
  else
    NODE="node"
  fi

  (
    cd "$RUNNER_ROOT" || exit 1
    PLAYWRIGHT_BROWSERS_PATH=0 nohup "$NODE" "$SERVER" >> "$OUT_LOG" 2>> "$ERR_LOG" &
  )
}

if ! is_runner_online; then
  start_runner
  wait_runner >/dev/null 2>&1 || true
fi

case "$URL" in
  *certificate-login*)
    curl -fsS --max-time 4 -X POST "${BASE_URL}/auth/certificate-login" >/dev/null 2>&1 || true
    ;;
esac
