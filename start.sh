#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT/.env"
API_LOG="$ROOT/logs/api-server.log"
DASHBOARD_LOG="$ROOT/logs/dashboard.log"

mkdir -p "$ROOT/logs"

# ── Stop any existing processes ───────────────────────────────────────────────
echo "Stopping existing processes..."
pkill -f "api-server/dist/index.js" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
sleep 1

# ── Build if dist is missing ──────────────────────────────────────────────────
if [ ! -f "$ROOT/packages/api-server/dist/index.js" ]; then
  echo "Building api-server..."
  npm run build --workspace=packages/api-server
fi

# ── Start API server ──────────────────────────────────────────────────────────
echo "Starting API server on :3100..."
if [ -f "$ENV_FILE" ]; then
  node --env-file="$ENV_FILE" "$ROOT/packages/api-server/dist/index.js" >> "$API_LOG" 2>&1 &
else
  node "$ROOT/packages/api-server/dist/index.js" >> "$API_LOG" 2>&1 &
fi
API_PID=$!
echo "  API server PID: $API_PID"

# Wait for API to be ready
for i in $(seq 1 10); do
  if curl -s http://localhost:3100/api/status > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# ── Start Dashboard ───────────────────────────────────────────────────────────
echo "Starting dashboard on :3000..."
npm run dev --workspace=packages/dashboard >> "$DASHBOARD_LOG" 2>&1 &
DASH_PID=$!
echo "  Dashboard PID: $DASH_PID"

echo ""
echo "Platform is starting:"
echo "  Dashboard  -> http://localhost:3000"
echo "  API server -> http://localhost:3100"
echo "  Logs       -> $ROOT/logs/"
echo ""
echo "To stop: kill $API_PID $DASH_PID"
echo "         or run: pkill -f 'api-server/dist/index.js'; pkill -f 'next dev'"
