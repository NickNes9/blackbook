#!/bin/bash
set -u
cd "$(dirname "$0")" || exit 1
export BLACK_BOOK_DATA_DIR="$(pwd -P)"
if [ -f runtime/version.txt ]; then
  version=$(tr -d '\r\n' < runtime/version.txt)
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Extract a fresh Black Book ZIP; the runtime version is invalid."; exit 1; }
  case "$(uname -m)" in x86_64) arch=x64 ;; arm64) arch=arm64 ;; *) echo "This download requires an Intel or Apple silicon Mac."; exit 1 ;; esac
  node="./runtime/node-v${version}-darwin-${arch}"
  if [ ! -f "$node" ]; then echo "Extract the complete ZIP before opening Black Book."; exit 1; fi
  chmod +x "$node" || exit 1
else
  node=node
fi
if [ "${1:-}" = '--stop' ]; then exec "$node" lib/stop.js; fi
exec "$node" lib/launch.js "$@"
