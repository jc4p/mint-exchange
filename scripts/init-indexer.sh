#!/bin/bash

# Script to initialize the indexer with a recent block number

echo "=== Indexer Initialization Script ==="
echo ""

# Default to a recent block (you can update this to the block where your contract was deployed)
# Contract deployment block: 31090760 (from the broadcast logs)
DEFAULT_BLOCK=31090760

# Get the block number from command line or use default
BLOCK_NUMBER=${1:-$DEFAULT_BLOCK}

echo "Initializing indexer from block: $BLOCK_NUMBER"
echo ""

# Initialize local database
if [ "$2" != "remote-only" ]; then
    echo "Setting initial block for local database..."
    
    # Create a temporary SQL file
    cat > /tmp/init_indexer.sql << EOF
-- Clear any existing records
DELETE FROM indexed_blocks;
-- Insert the new starting block
INSERT INTO indexed_blocks (block_number) VALUES ($BLOCK_NUMBER);
EOF
    
    wrangler d1 execute nft-exchange --file=/tmp/init_indexer.sql --local
    rm -f /tmp/init_indexer.sql
    
    echo "✅ Local database initialized"
fi

# Initialize remote database if requested
if [ "$2" = "remote" ] || [ "$2" = "remote-only" ]; then
    echo ""
    echo "Setting initial block for remote database..."
    
    # Create a temporary SQL file
    cat > /tmp/init_indexer.sql << EOF
-- Clear any existing records
DELETE FROM indexed_blocks;
-- Insert the new starting block
INSERT INTO indexed_blocks (block_number) VALUES ($BLOCK_NUMBER);
EOF
    
    wrangler d1 execute nft-exchange --file=/tmp/init_indexer.sql --remote
    rm -f /tmp/init_indexer.sql
    
    echo "✅ Remote database initialized"
fi

echo ""
echo "Indexer initialization complete!"
echo "The indexer will start processing events from block $BLOCK_NUMBER"