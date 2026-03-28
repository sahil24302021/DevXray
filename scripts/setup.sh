#!/bin/bash
# ═══════════════════════════════════════════════════════
#  DevXray — Setup Script (First-time install)
# ═══════════════════════════════════════════════════════
# Usage: ./scripts/setup.sh

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

echo "╔═══════════════════════════════════════════════════════╗"
echo "║         DevXray AI — First-Time Setup                ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# ── 1. Frontend Dependencies ──
echo "📦 [1/4] Installing frontend dependencies..."
cd "$ROOT_DIR"
npm install

# ── 2. Backend Virtual Environment ──
echo "🐍 [2/4] Setting up Python virtual environment..."
if [ ! -d "$BACKEND_DIR/venv" ]; then
    python3 -m venv "$BACKEND_DIR/venv"
fi
source "$BACKEND_DIR/venv/bin/activate"

# ── 3. Backend Dependencies ──
echo "📦 [3/4] Installing backend dependencies..."
pip install -r "$BACKEND_DIR/requirements.txt"

# ── 4. Environment Files ──
echo "📝 [4/4] Setting up environment files..."
if [ ! -f "$ROOT_DIR/.env.local" ]; then
    cp "$ROOT_DIR/.env.local.example" "$ROOT_DIR/.env.local"
    echo "   Created .env.local (edit with your Clerk/Supabase keys)"
fi
if [ ! -f "$BACKEND_DIR/.env" ]; then
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    echo "   Created backend/.env (edit with your API keys)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Setup complete!"
echo ""
echo "  Next steps:"
echo "    1. Edit .env.local with your Clerk & Supabase keys"
echo "    2. Edit backend/.env with your Gemini & GitHub keys"
echo "    3. Run: ./scripts/dev.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
