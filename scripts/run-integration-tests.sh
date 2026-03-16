#!/usr/bin/env bash
# run-integration-tests.sh
#
# Runs the full tokenist-js integration test suite against a local wrangler dev
# instance. Handles server lifecycle automatically.
#
# Usage:
#   ./scripts/run-integration-tests.sh            # run all integration tests
#   ./scripts/run-integration-tests.sh --testPathPattern=rate-limits  # run one suite
#
# Environment:
#   TOKENIST_BASE_URL   Server URL (default: http://localhost:8081)
#   OPENAI_API_KEY      Required only for sentiment tests (optional — skipped when absent)
#
# Prerequisites:
#   - Node.js 18+
#   - wrangler (npx wrangler) installed
#   - npm dependencies installed in both repo root and tokenist-js/

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${TOKENIST_BASE_URL:-http://localhost:8081}"
WRANGLER_PID=""

cleanup() {
  if [[ -n "$WRANGLER_PID" ]]; then
    echo "Stopping wrangler dev (PID $WRANGLER_PID)..."
    kill "$WRANGLER_PID" 2>/dev/null || true
    wait "$WRANGLER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# ── Step 1: Install dependencies if needed ──────────────────────────────────
echo "Checking dependencies..."
cd "$ROOT_DIR"
if [[ ! -d "node_modules" ]]; then
  echo "Installing root dependencies..."
  npm install
fi
cd "$ROOT_DIR/tokenist-js"
if [[ ! -d "node_modules" ]]; then
  echo "Installing tokenist-js dependencies..."
  npm install
fi
cd "$ROOT_DIR"

# ── Step 2: Initialise D1 database (first run only) ─────────────────────────
if [[ ! -d ".wrangler" ]]; then
  echo "Initializing D1 database (first-time setup)..."
  npm run init
fi

# ── Step 3: Start wrangler dev in background ────────────────────────────────
echo "Starting tokenist API on $BASE_URL..."
npm run dev > /tmp/wrangler-dev.log 2>&1 &
WRANGLER_PID=$!
echo "wrangler dev started (PID $WRANGLER_PID)"

# ── Step 4: Wait for the server to be ready ─────────────────────────────────
echo "Waiting for server to be ready..."
max_retries=30
for i in $(seq 1 $max_retries); do
  if curl --silent --fail "${BASE_URL}/health" > /dev/null 2>&1; then
    echo "Server is ready (waited ${i}s)."
    break
  fi
  if [[ "$i" == "$max_retries" ]]; then
    echo "ERROR: Server did not start within ${max_retries}s" >&2
    echo "--- wrangler dev log ---" >&2
    cat /tmp/wrangler-dev.log >&2
    exit 1
  fi
  sleep 1
done

# ── Step 5: Run integration tests ───────────────────────────────────────────
echo ""
echo "Running integration tests against $BASE_URL..."
echo "----------------------------------------"
cd "$ROOT_DIR/tokenist-js"

TOKENIST_BASE_URL="$BASE_URL" \
  npx jest \
    --config jest.integration.config.js \
    --runInBand \
    --forceExit \
    "$@"

echo "----------------------------------------"
echo "Integration tests completed."
