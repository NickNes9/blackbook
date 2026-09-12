#!/bin/bash
# Black Book launcher for macOS - double-click to start the app.
# Server output goes to Server.log in this folder. Stop it with "Stop Black Book.command".
set -u
cd "$(dirname "$0")"

PORTS=(3000 4300 8400 8800 9000 9900)

port_open() {
  (exec 3<>/dev/tcp/127.0.0.1/"$1") >/dev/null 2>&1 || return 1
  exec 3>&- 3<&-
  return 0
}

first_up() {
  local p
  for p in "${PORTS[@]}"; do
    if port_open "$p"; then echo "$p"; return 0; fi
  done
  return 1
}

if running=$(first_up); then
  open "http://localhost:$running"
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Black Book needs Node.js, but 'node' was not found."
  echo "Install it from https://nodejs.org and run this launcher again."
  read -r -p "Press Enter to close... " _ || true
  exit 1
fi

nohup node server.js >> Server.log 2>&1 &
echo "Starting Black Book (pid $!)... logs in Server.log"

bound=""
for ((i = 0; i < 60; i++)); do
  bound=$(first_up || true)
  if [ -n "$bound" ]; then break; fi
  sleep 0.3
done
if [ -z "$bound" ]; then bound=4300; fi
open "http://localhost:$bound"
exit 0