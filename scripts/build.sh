#!/usr/bin/env zsh
set -euo pipefail

if [[ ! -d node_modules ]]; then
  echo "Dependencies not installed. Running setup first…"
  ./scripts/setup.sh
fi

echo "==> Type-checking…"
pnpm typecheck

echo "==> Linting…"
pnpm lint

echo "==> Building client…"
pnpm build:client

echo "==> Building server…"
pnpm build:server

echo ""
echo "Build complete. Start with:"
echo "  node dist/server/server/index.js"
