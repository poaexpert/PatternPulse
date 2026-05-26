#!/bin/bash
set -e

cleanup() {
  echo "[start.sh] Shutting down..."
  kill "$BOT_PID" 2>/dev/null
  wait "$BOT_PID" 2>/dev/null
  exit 0
}
trap cleanup SIGTERM SIGINT

# Start ChartSpyder AI bot on internal port 8081
BOT_PORT=8081 python3 bot.py &
BOT_PID=$!
echo "[start.sh] ChartSpyder bot started (PID=$BOT_PID)"

# Hand over to Node.js (blocks until it exits)
exec node backend/dist/server.js
