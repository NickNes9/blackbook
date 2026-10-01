#!/bin/bash
set -u
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Black Book needs Node.js. Install it from https://nodejs.org and try again."
  read -r -p "Press Enter to close... " _ || true
  exit 1
fi
node lib/launch.js
