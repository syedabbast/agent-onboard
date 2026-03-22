#!/usr/bin/env bash
set -euo pipefail

echo "=== Agent OnBoard Work Server Setup ==="
echo ""

SCRIPTS_DIR="$HOME/agent-onboard-scripts"
ENV_FILE=".env"

# 1. Create scripts directory
echo "[1/4] Creating scripts directory at $SCRIPTS_DIR ..."
mkdir -p "$SCRIPTS_DIR"
echo "  Done."

# 2. Install npm dependencies
echo "[2/4] Installing dependencies ..."
npm install
echo "  Done."

# 3. Copy .env.example to .env if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
  echo "[3/4] Creating .env from .env.example ..."
  cp .env.example "$ENV_FILE"
  echo "  Done."
else
  echo "[3/4] .env already exists — skipping copy."
fi

# 4. Generate a random token and inject it into .env
TOKEN=$(openssl rand -hex 32)
echo "[4/4] Generating random WORK_SERVER_TOKEN ..."

if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|^WORK_SERVER_TOKEN=.*|WORK_SERVER_TOKEN=$TOKEN|" "$ENV_FILE"
else
  sed -i "s|^WORK_SERVER_TOKEN=.*|WORK_SERVER_TOKEN=$TOKEN|" "$ENV_FILE"
fi

echo "  Token written to .env"
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit .env and fill in SUPABASE_URL and SUPABASE_ANON_KEY"
echo "  2. Run:  npm start   (or npm run dev for auto-reload)"
echo "  3. Your work-server token is: $TOKEN"
echo "     Save this — the React app needs it to authenticate requests."
echo ""
