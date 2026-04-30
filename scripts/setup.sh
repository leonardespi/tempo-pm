#!/usr/bin/env bash
# Tempo — setup & CLI installer
# Usage: bash scripts/setup.sh
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
fail() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }
step() { echo -e "\n${BLUE}──${NC} ${BOLD}$*${NC}"; }

# Resolve project root (one level above scripts/)
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

NODE_MIN=20
API_PORT=3001
UI_PORT=4173

# ── 1. Node.js ────────────────────────────────────────────────────────────────
step "Checking Node.js (>= $NODE_MIN required)"

_ensure_node() {
  if [[ "$(uname)" == "Darwin" ]] && command -v brew &>/dev/null; then
    warn "Installing Node.js via Homebrew…"
    brew install node
  elif [[ -f "$HOME/.nvm/nvm.sh" ]]; then
    warn "Installing Node.js $NODE_MIN via nvm…"
    # shellcheck source=/dev/null
    source "$HOME/.nvm/nvm.sh"
    nvm install "$NODE_MIN"
    nvm use "$NODE_MIN"
  else
    fail "Node.js not found. Install it from https://nodejs.org (v$NODE_MIN+) or via nvm."
  fi
}

if ! command -v node &>/dev/null; then
  _ensure_node
fi

NODE_MAJOR=$(node -e 'console.log(parseInt(process.versions.node))')
if [[ "$NODE_MAJOR" -lt "$NODE_MIN" ]]; then
  warn "Found Node.js $(node --version); need v$NODE_MIN+."
  _ensure_node
  NODE_MAJOR=$(node -e 'console.log(parseInt(process.versions.node))')
  [[ "$NODE_MAJOR" -lt "$NODE_MIN" ]] && fail "Could not upgrade Node.js. Please install v$NODE_MIN+ manually."
fi
ok "Node.js $(node --version)"

# ── 2. pnpm ───────────────────────────────────────────────────────────────────
step "Checking pnpm"

if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found — installing via npm…"
  npm install -g pnpm || fail "npm install -g pnpm failed."
fi
ok "pnpm $(pnpm --version)"

# ── 3. Project dependencies ───────────────────────────────────────────────────
step "Installing project dependencies"

cd "$APP_DIR"
if [[ ! -d node_modules ]] || [[ pnpm-lock.yaml -nt node_modules ]]; then
  pnpm install --frozen-lockfile
  ok "Dependencies installed."
else
  ok "Dependencies already up to date."
fi

# ── 4. Data directory ─────────────────────────────────────────────────────────
step "Checking data directory"

DATA_FILE="$APP_DIR/data/data.json"
if [[ ! -f "$DATA_FILE" ]]; then
  mkdir -p "$APP_DIR/data"
  cat > "$DATA_FILE" << 'JSON'
{
  "projects": [],
  "tasks": [],
  "subtasks": [],
  "users": [],
  "workingDays": { "weekends": [0, 6], "holidays": [] },
  "settings": { "theme": "system" }
}
JSON
  ok "Created $DATA_FILE"
else
  ok "Data file exists — skipped."
fi

# ── 5. Build ──────────────────────────────────────────────────────────────────
step "Building Tempo (client + server)"

pnpm run build || fail "Build failed — run 'pnpm run build' manually to see errors."
ok "Build complete → $APP_DIR/dist"

# ── 6. Write tempo-pm launcher ────────────────────────────────────────────────
step "Installing tempo-pm command"

LAUNCHER_DIR="$HOME/.local/bin"
LAUNCHER="$LAUNCHER_DIR/tempo-pm"
mkdir -p "$LAUNCHER_DIR"

# Write launcher with placeholder tokens; substitute below.
cat > "$LAUNCHER" << 'LAUNCHER_EOF'
#!/usr/bin/env bash
# tempo-pm — launch Tempo project manager
set -euo pipefail

APP_DIR="__APP_DIR__"
API_PORT=__API_PORT__
UI_PORT=__UI_PORT__

# ── Argument parsing ─────────────────────────────────────────────────────────
BUILD=false
DEV=false

for arg in "$@"; do
  case "$arg" in
    --build|-b) BUILD=true ;;
    --dev|-d)   DEV=true   ;;
    --help|-h)
      cat << 'HELP'
Usage: tempo-pm [option]

  (no option)   Launch production build; rebuilds if dist/ is missing
  -b, --build   Force a full rebuild before launching
  -d, --dev     Start in dev mode with hot reload (no build required)
  -h, --help    Show this message
HELP
      exit 0
      ;;
    *) echo "Unknown option: $arg  (try --help)" >&2; exit 1 ;;
  esac
done

cd "$APP_DIR"

# ── Dev mode (shortcut) ──────────────────────────────────────────────────────
if [[ "$DEV" == "true" ]]; then
  echo "→ Starting Tempo in dev mode…"
  exec pnpm dev
fi

# ── Ensure dist/ exists ──────────────────────────────────────────────────────
if [[ "$BUILD" == "true" ]] || [[ ! -d "$APP_DIR/dist" ]]; then
  echo "→ Building Tempo…"
  pnpm run build
  echo "✓ Build complete."
fi

# ── Cleanup on Ctrl-C / TERM ─────────────────────────────────────────────────
API_PID=""
UI_PID=""
cleanup() {
  echo ""
  echo "Stopping Tempo…"
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "$UI_PID"  ]] && kill "$UI_PID"  2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# ── Start Fastify API server ──────────────────────────────────────────────────
echo "→ Starting API server on port $API_PORT…"
node "$APP_DIR/dist/server/server/index.js" &
API_PID=$!

# Wait up to 5 s for the API to become ready
echo -n "  Waiting"
for i in $(seq 1 25); do
  if curl -sf "http://127.0.0.1:$API_PORT/api/data" >/dev/null 2>&1; then
    echo "  ✓"
    break
  fi
  printf '.'
  sleep 0.2
  if [[ "$i" -eq 25 ]]; then
    echo ""
    echo "✗ API did not respond after 5 s. Check for port conflicts on $API_PORT." >&2
    cleanup
  fi
done

# ── Start Vite preview (serves dist/ + proxies /api → Fastify) ───────────────
echo "→ Starting UI preview on http://localhost:$UI_PORT…"
pnpm exec vite preview --port "$UI_PORT" --host 127.0.0.1 >/dev/null 2>&1 &
UI_PID=$!
sleep 1

# ── Open browser ─────────────────────────────────────────────────────────────
URL="http://localhost:$UI_PORT"
if command -v open &>/dev/null; then          # macOS
  open "$URL"
elif command -v xdg-open &>/dev/null; then    # Linux
  xdg-open "$URL" &
elif command -v start &>/dev/null; then       # Windows (Git Bash)
  start "$URL"
fi

echo ""
echo "  Tempo → $URL"
echo "  Press Ctrl+C to stop."
echo ""

# Keep running until API exits
wait "$API_PID"
LAUNCHER_EOF

# Substitute placeholder tokens with real values
sed -i.bak \
  -e "s|__APP_DIR__|$APP_DIR|g" \
  -e "s|__API_PORT__|$API_PORT|g" \
  -e "s|__UI_PORT__|$UI_PORT|g" \
  "$LAUNCHER"
rm -f "$LAUNCHER.bak"
chmod +x "$LAUNCHER"
ok "Created $LAUNCHER"

# ── 7. Ensure ~/.local/bin is in PATH ────────────────────────────────────────
step "Checking PATH"

SHELL_RC=""
case "${SHELL:-}" in
  *zsh)  SHELL_RC="$HOME/.zshrc"  ;;
  *bash) SHELL_RC="$HOME/.bashrc" ;;
esac

if [[ -n "$SHELL_RC" ]]; then
  if ! grep -qF "$HOME/.local/bin" "$SHELL_RC" 2>/dev/null; then
    {
      echo ""
      echo "# Tempo CLI"
      echo 'export PATH="$HOME/.local/bin:$PATH"'
    } >> "$SHELL_RC"
    warn "Added \$HOME/.local/bin to PATH in $SHELL_RC"
    warn "Run: source $SHELL_RC  (or open a new terminal)"
  else
    ok "\$HOME/.local/bin already in PATH ($SHELL_RC)."
  fi
fi

# Export for the remainder of this session so the user can test immediately
export PATH="$HOME/.local/bin:$PATH"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Tempo is ready!${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  tempo-pm             launch (rebuilds if dist/ missing)"
echo "  tempo-pm --build     force rebuild, then launch"
echo "  tempo-pm --dev       dev mode with hot reload"
echo "  tempo-pm --help      show options"
echo ""
echo "  App dir: $APP_DIR"
echo "  Data:    $APP_DIR/data/data.json"
echo ""
