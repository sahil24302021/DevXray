#!/bin/bash
# ═══════════════════════════════════════════════════════
#  DevXray — Start Both Frontend & Backend (Dev Mode)
# ═══════════════════════════════════════════════════════
# Usage: ./scripts/dev.sh

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

echo "╔═══════════════════════════════════════════════════════╗"
echo "║         DevXray AI — Development Server              ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# ── Check backend venv ──
if [ ! -d "$BACKEND_DIR/venv" ]; then
    echo "⚠ No Python venv found. Creating one..."
    python3 -m venv "$BACKEND_DIR/venv"
    source "$BACKEND_DIR/venv/bin/activate"
    pip install -r "$BACKEND_DIR/requirements.txt"
else
    source "$BACKEND_DIR/venv/bin/activate"
fi

# ── Check node_modules ──
if [ ! -d "$ROOT_DIR/node_modules" ]; then
    echo "⚠ No node_modules found. Installing..."
    cd "$ROOT_DIR" && npm install
fi

# ── Start Backend (port 8000) ──
echo "🟢 Starting Backend (FastAPI) on http://localhost:8000 ..."
cd "$BACKEND_DIR"
uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# ── Start Frontend (port 3000) ──
echo "🟢 Starting Frontend (Next.js) on http://localhost:3000 ..."
cd "$ROOT_DIR"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Frontend  → http://localhost:3000"
echo "  Backend   → http://localhost:8000"
echo "  API Docs  → http://localhost:8000/docs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

# ── Trap Ctrl+C to kill both ──
trap "echo ''; echo '🔴 Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
