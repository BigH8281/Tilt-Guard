#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
FRONTEND_ROOT="$PROJECT_ROOT/frontend"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:$FRONTEND_PORT}"
ENV_FILE="$PROJECT_ROOT/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -f "$PROJECT_ROOT/.venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.venv/bin/activate"
elif [[ -f "$PROJECT_ROOT/venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/venv/bin/activate"
fi

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Python was not found. Install Python 3 or activate a virtual environment first." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js/npm first." >&2
  exit 1
fi

export JWT_SECRET_KEY="${JWT_SECRET_KEY:-tilt-guard-local-dev-secret}"

BACKEND_PID=""
FRONTEND_PID=""

ensure_port_free() {
  local port="$1"
  local name="$2"

  if ss -ltn "( sport = :$port )" | tail -n +2 | grep -q .; then
    echo "$name port $port is already in use." >&2
    if command -v lsof >/dev/null 2>&1; then
      lsof -iTCP:"$port" -sTCP:LISTEN >&2 || true
    else
      ss -ltnp "( sport = :$port )" >&2 || true
    fi
    echo "Stop the existing process or rerun with a different port." >&2
    exit 1
  fi
}

cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

ensure_port_free "$BACKEND_PORT" "Backend"
ensure_port_free "$FRONTEND_PORT" "Frontend"

echo "Starting backend from $PROJECT_ROOT"
"$PYTHON_BIN" -m alembic upgrade head
"$PYTHON_BIN" -m uvicorn app.main:app --reload --host 127.0.0.1 --port "$BACKEND_PORT" &
BACKEND_PID=$!

if [[ ! -d "$FRONTEND_ROOT/node_modules" ]]; then
  echo "Installing frontend dependencies in $FRONTEND_ROOT"
  (cd "$FRONTEND_ROOT" && npm install)
fi

echo "Starting frontend from $FRONTEND_ROOT"
(cd "$FRONTEND_ROOT" && npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort) &
FRONTEND_PID=$!

sleep 4

if [[ "${TILT_GUARD_NO_BROWSER:-0}" != "1" ]]; then
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$FRONTEND_URL" >/dev/null 2>&1 || true
  elif command -v wslview >/dev/null 2>&1; then
    wslview "$FRONTEND_URL" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "$FRONTEND_URL" >/dev/null 2>&1 || true
  else
    echo "Browser auto-open skipped: no supported opener found."
  fi
fi

echo "Tilt-Guard frontend: $FRONTEND_URL"
echo "Tilt-Guard backend: http://127.0.0.1:$BACKEND_PORT"
echo "Press Ctrl+C in this terminal to stop both services."

wait "$BACKEND_PID" "$FRONTEND_PID"
