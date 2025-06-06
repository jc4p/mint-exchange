#!/bin/bash

# Script to reset the database (drop all tables and recreate)

echo "=== Database Reset Script ==="
echo ""

# Function to reset database
reset_database() {
    local environment=$1
    local flag=""
    
    if [ "$environment" = "remote" ]; then
        flag="--remote"
    fi
    
    echo "Resetting $environment database..."
    
    # Create a temporary SQL file with all DROP statements
    cat > /tmp/drop_tables.sql << 'EOF'
-- Drop views first (they depend on tables)
DROP VIEW IF EXISTS user_stats;
DROP VIEW IF EXISTS user_activity_summary;
DROP VIEW IF EXISTS active_listings_with_users;

-- Drop tables in order (respecting foreign key constraints)
DROP TABLE IF EXISTS indexed_blocks;
DROP TABLE IF EXISTS activity;
DROP TABLE IF EXISTS offers;
DROP TABLE IF EXISTS listings;
DROP TABLE IF EXISTS users;
EOF
    
    # Execute the DROP statements
    echo "Dropping existing tables..."
    wrangler d1 execute nft-exchange --file=/tmp/drop_tables.sql $flag
    
    # Clean up temp file
    rm -f /tmp/drop_tables.sql
    
    echo "Tables dropped successfully."
    
    # Recreate schema
    echo "Recreating schema..."
    wrangler d1 execute nft-exchange --file=./schema.sql $flag
    
    echo "$environment database reset complete!"
    echo ""
}

# Check if we should reset local, remote, or both
if [ "$1" = "local" ]; then
    reset_database "local"
elif [ "$1" = "remote" ]; then
    echo "⚠️  WARNING: This will reset the REMOTE production database!"
    echo "All data will be lost. Are you sure? (type 'yes' to confirm)"
    read confirmation
    if [ "$confirmation" = "yes" ]; then
        reset_database "remote"
    else
        echo "Remote database reset cancelled."
    fi
elif [ "$1" = "both" ]; then
    reset_database "local"
    echo "⚠️  WARNING: This will also reset the REMOTE production database!"
    echo "All data will be lost. Are you sure? (type 'yes' to confirm)"
    read confirmation
    if [ "$confirmation" = "yes" ]; then
        reset_database "remote"
    else
        echo "Remote database reset cancelled."
    fi
else
    echo "Usage: $0 [local|remote|both]"
    echo ""
    echo "Examples:"
    echo "  $0 local   - Reset local development database"
    echo "  $0 remote  - Reset remote production database (requires confirmation)"
    echo "  $0 both    - Reset both databases"
    exit 1
fi

echo "✅ Database reset complete!"