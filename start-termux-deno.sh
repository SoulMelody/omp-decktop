#!/usr/bin/env bash
# Termux launcher for omp-deck:
#   - server: Bun, because omp-deck server depends on omp/Bun runtime
#   - web:    Deno, to avoid Bun/Vite native optional dependency issues on Android

set -euo pipefail

cd "$(dirname "$0")"

LOG_DIR=".logs"
PID_FILE="$LOG_DIR/termux-deno.pid"
SERVER_LOG="$LOG_DIR/termux-server.log"
WEB_LOG="$LOG_DIR/termux-web.log"
DECK_HOST="${OMP_DECK_HOST:-127.0.0.1}"
SERVER_PORT="${OMP_DECK_PORT:-8787}"
WEB_PORT="${OMP_DECK_WEB_PORT:-5173}"
DECK_URL="http://$DECK_HOST:$WEB_PORT"

BUN_BIN="${BUN_BIN:-$HOME/.bun/bin/bun}"
DENO_BIN="${DENO_BIN:-deno}"
VITE_SPEC="${OMP_DECK_VITE_SPEC:-npm:vite}"

mkdir -p "$LOG_DIR"

require_command() {
  local name="$1"
  local path="$2"
  if ! command -v "$path" >/dev/null 2>&1; then
    echo "error: $name not found: $path" >&2
    exit 1
  fi
}

ensure_bun_node_modules() {
  if [ ! -d node_modules/.bun ] || [ -d node_modules/.deno ]; then
    echo "==> Restoring Bun node_modules before starting the server..."
    rm -rf node_modules
    "$BUN_BIN" install
  fi
}

server_cmd() {
  exec env OMP_DECK_HOST="$DECK_HOST" OMP_DECK_PORT="$SERVER_PORT" "$BUN_BIN" run dev:server
}

web_cmd() {
  cd apps/web
  exec env \
    OMP_DECK_HOST="$DECK_HOST" \
    OMP_DECK_PORT="$SERVER_PORT" \
    OMP_DECK_WEB_PORT="$WEB_PORT" \
    "$DENO_BIN" run -A --node-modules-dir "$VITE_SPEC" --host "$DECK_HOST" --port "$WEB_PORT"
}

kill_tree() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null || true
}

kill_tree_force() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree_force "$child"
  done
  kill -KILL "$pid" 2>/dev/null || true
}

kill_pid_file() {
  if [ ! -f "$PID_FILE" ]; then
    echo "no PID file at $PID_FILE — nothing to stop"
    return 0
  fi

  while read -r pid; do
    [ -n "${pid:-}" ] || continue
    if kill -0 "$pid" 2>/dev/null; then
      kill_tree "$pid"
    fi
  done < "$PID_FILE"

  sleep 1

  while read -r pid; do
    [ -n "${pid:-}" ] || continue
    if kill -0 "$pid" 2>/dev/null; then
      kill_tree_force "$pid"
    fi
  done < "$PID_FILE"

  rm -f "$PID_FILE"
  echo "stopped omp-deck Termux Deno run"
}

case "${1:-foreground}" in
  start)
    require_command bun "$BUN_BIN"
    require_command deno "$DENO_BIN"
    ensure_bun_node_modules

    if [ -f "$PID_FILE" ]; then
      while read -r pid; do
        if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
          echo "omp-deck already running. Logs: $SERVER_LOG, $WEB_LOG"
          exit 0
        fi
      done < "$PID_FILE"
    fi

    : > "$SERVER_LOG"
    : > "$WEB_LOG"

    server_cmd > "$SERVER_LOG" 2>&1 &
    SERVER_PID=$!
    web_cmd > "$WEB_LOG" 2>&1 &
    WEB_PID=$!
    printf '%s\n%s\n' "$SERVER_PID" "$WEB_PID" > "$PID_FILE"

    echo "omp-deck started"
    echo "  web:    $DECK_URL"
    echo "  server: http://$DECK_HOST:$SERVER_PORT"
    echo "  logs:   $SERVER_LOG, $WEB_LOG"
    ;;

  stop)
    kill_pid_file
    ;;

  status)
    if [ ! -f "$PID_FILE" ]; then
      echo "not running"
      exit 0
    fi
    alive=0
    while read -r pid; do
      [ -n "${pid:-}" ] || continue
      if kill -0 "$pid" 2>/dev/null; then
        echo "running pid $pid"
        alive=1
      fi
    done < "$PID_FILE"
    [ "$alive" -eq 1 ] || echo "not running"
    ;;

  foreground|"")
    require_command bun "$BUN_BIN"
    require_command deno "$DENO_BIN"
    ensure_bun_node_modules

    cleanup() {
      if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill -TERM "$SERVER_PID" 2>/dev/null || true
      fi
      if [ -n "${WEB_PID:-}" ] && kill -0 "$WEB_PID" 2>/dev/null; then
        kill -TERM "$WEB_PID" 2>/dev/null || true
      fi
    }
    trap cleanup INT TERM EXIT

    server_cmd &
    SERVER_PID=$!
    web_cmd &
    WEB_PID=$!

    echo "omp-deck running"
    echo "  web:    $DECK_URL"
    echo "  server: http://$DECK_HOST:$SERVER_PORT"
    wait "$WEB_PID"
    ;;

  *)
    cat <<USAGE
Usage: $0 [start|stop|status|foreground]

  (no arg)     foreground run: Bun server + Deno web
  start        background run, logs under $LOG_DIR/
  stop         terminate background run
  status       check background run

Environment overrides:
  BUN_BIN                  default: $HOME/.bun/bin/bun
  DENO_BIN                 default: deno
  OMP_DECK_HOST            default: 127.0.0.1
  OMP_DECK_PORT            default: 8787
  OMP_DECK_WEB_PORT        default: 5173
  OMP_DECK_VITE_SPEC       default: npm:vite
USAGE
    exit 1
    ;;
esac
