#!/usr/bin/env zsh
set -euo pipefail

if [[ ! -d node_modules ]]; then
  echo "Dependencies not installed. Running setup first…"
  ./scripts/setup.sh
fi

echo "Starting Project Tracker at http://localhost:5173"
exec pnpm dev
