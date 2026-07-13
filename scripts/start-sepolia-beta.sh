#!/usr/bin/env bash
# Start the wstDIEM indexer + web app against the LIVE Base Sepolia mock deployment.
# One command for the phase-2 "open a loop" verification. Ctrl-C stops both services.
#
#   ./scripts/start-sepolia-beta.sh
#
# Requires the gitignored env files created during activation:
#   app/.env.local, indexer/.env  (see LAUNCH_READINESS.md).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RPC="https://base-sepolia-rpc.publicnode.com"
REGISTRY="0xdfdaf03861400273a0a661ed6f9a1163864f2860"
MARKET="0x993a63168f646baefcfec1acc9f44138ce787143a31655f5a1a97957924261d2"
TEST_WALLET="0xb41891318Be43D2A966f574BaFC52D0a501Db96A"
INDEXER_HEALTH="http://127.0.0.1:8791/health"

echo "== wstDIEM Base Sepolia beta — indexer + app =="

# 1. Prerequisites
[ -f app/.env.local ] || { echo "x app/.env.local missing — run env wiring first (see LAUNCH_READINESS.md)"; exit 1; }
[ -f indexer/.env ]   || { echo "x indexer/.env missing — run env wiring first"; exit 1; }
[ -d node_modules ]   || { echo "... installing workspace deps"; npm install; }

# 2. Market-live check (informational — the app still runs pre-apply, opens just fail-closed)
if command -v cast >/dev/null 2>&1; then
  LIVE=$(cast call "$REGISTRY" "validateExternalConfig(bytes32,uint8)(bool)" "$MARKET" 1 --rpc-url "$RPC" 2>/dev/null || echo "unknown")
  if [ "$LIVE" = "true" ]; then
    echo "  market OPEN gate: true — loops can be opened"
  else
    echo "  market OPEN gate: $LIVE — phase-2 fingerprint apply has NOT landed yet (unlocks ~block 44184367)."
    echo "  Services will run, but opening a loop fail-closes until phase 2 applies."
  fi
fi

# 3. Start the indexer (background)
mkdir -p "$ROOT/.run"
INDEXER_LOG="$ROOT/.run/indexer-sepolia.log"
echo "-> starting indexer (log: $INDEXER_LOG)"
( cd "$ROOT/indexer" && npx tsx src/cli.ts run ) >"$INDEXER_LOG" 2>&1 &
INDEXER_PID=$!

cleanup() {
  echo
  echo "-> stopping indexer (pid $INDEXER_PID)"
  kill "$INDEXER_PID" 2>/dev/null || true
  wait "$INDEXER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 4. Wait for the indexer API to come up
printf -- "-> waiting for indexer /health "
for _ in $(seq 1 30); do
  if curl -sf "$INDEXER_HEALTH" >/dev/null 2>&1; then echo "ok"; break; fi
  if ! kill -0 "$INDEXER_PID" 2>/dev/null; then
    echo "FAILED"; echo "indexer exited early — last log lines:"; tail -20 "$INDEXER_LOG"; exit 1
  fi
  printf "."; sleep 2
done

echo "-> indexer API: http://127.0.0.1:8791  (/health /actions /policies /snapshots)"
echo "-> test wallet (1,000,000 DIEM + wstDIEM): $TEST_WALLET"
echo "   import its key from ~/.wstdiem-sepolia-deployer.json into a browser wallet, or use any wallet"
echo "   and self-mint via MockERC20.mint (the mock tokens are open-mint)."
echo "-> starting app dev server — open the printed URL, connect on Base Sepolia (chain 84532)."
echo "   Ctrl-C stops BOTH the app and the indexer."
echo

# 5. Start the app in the foreground (Vite loads app/.env.local). Not exec'd so the
#    trap fires on Ctrl-C and tears down the indexer too.
npm run -w app dev
