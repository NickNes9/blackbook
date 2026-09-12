#!/usr/bin/env bash
# Stop Black Book (Linux). Only stops the server started from this folder.
set -u
cd "$(dirname "$0")"

PIDFILE="Black Book.pid"
if [ ! -f "$PIDFILE" ]; then
  echo "Black Book is not running."
  exit 0
fi

record=$(cat "$PIDFILE" 2>/dev/null)
pid=$(printf '%s' "$record" | sed -n 's/.*"pid"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p')
started=$(printf '%s' "$record" | sed -n 's/.*"startedAt"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p')

if [ -z "$pid" ]; then
  echo "Black Book is not running (bad PID file)."
  rm -f "$PIDFILE"
  exit 0
fi

now_ms=$(( $(date +%s) * 1000 ))
if [ -n "$started" ] && [ $((now_ms - started)) -gt 5000 ]; then
  echo "Black Book is not running (stale PID file)."
  rm -f "$PIDFILE"
  exit 0
fi

cmd=$(ps -p "$pid" -o command= 2>/dev/null)
case "$cmd" in
  *server.js*) ;;
  *)
    echo "Black Book is not running (PID $pid is not a Black Book server)."
    rm -f "$PIDFILE"
    exit 0 ;;
esac

kill "$pid" 2>/dev/null && echo "Black Book stopped."
rm -f "$PIDFILE"
exit 0