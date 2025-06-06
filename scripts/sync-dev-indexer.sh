#!/usr/bin/env bash
set -e

# Usage: sync-dev-indexer.sh [port]
# port: The port where wrangler dev is running. Defaults to 8787.

PORT=${1:-8787}

echo "📡 Syncing via repeated scheduled triggers..."
while true; do
  response=$(curl -s http://localhost:${PORT}/__scheduled)
  sleep 1
done
echo "✅ Local indexer sync complete"