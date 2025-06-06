#!/bin/bash

echo "=== Resetting and Initializing Database ==="
echo ""

# Reset local database
./scripts/reset-database.sh local

# Initialize indexer with contract deployment block
./scripts/init-indexer.sh 31090760

echo ""
echo "✅ Database reset and initialized!"
echo ""
echo "To reset remote database, run:"
echo "  ./scripts/reset-database.sh remote"
echo "  ./scripts/init-indexer.sh 31090760 remote"
