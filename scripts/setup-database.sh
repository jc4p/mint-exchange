#!/bin/bash

echo "🚀 Setting up D1 Database for NFT Exchange"
echo "=========================================="

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Please install it first:"
    echo "   npm install -g wrangler"
    exit 1
fi

# Check if user is logged in to Cloudflare
echo "📋 Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    echo "❌ Not logged in to Cloudflare. Running 'wrangler login'..."
    wrangler login
fi

# Create the D1 database
echo ""
echo "📦 Creating D1 database 'nft-exchange'..."
DB_OUTPUT=$(wrangler d1 create nft-exchange 2>&1)

if echo "$DB_OUTPUT" | grep -q "database_id"; then
    # Extract database ID from output
    DB_ID=$(echo "$DB_OUTPUT" | grep -o '"database_id":\s*"[^"]*"' | sed 's/"database_id":\s*"//' | sed 's/"//')
    echo "✅ Database created successfully!"
    echo "   Database ID: $DB_ID"
    
    # Update wrangler.toml with the database ID
    echo ""
    echo "📝 Updating wrangler.toml with database ID..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/database_id = \"YOUR_DATABASE_ID\"/database_id = \"$DB_ID\"/" wrangler.toml
    else
        # Linux
        sed -i "s/database_id = \"YOUR_DATABASE_ID\"/database_id = \"$DB_ID\"/" wrangler.toml
    fi
    echo "✅ wrangler.toml updated!"
else
    if echo "$DB_OUTPUT" | grep -q "already exists"; then
        echo "⚠️  Database 'nft-exchange' already exists"
        echo "   To get the database ID, run: wrangler d1 list"
        echo "   Then update the database_id in wrangler.toml manually"
    else
        echo "❌ Failed to create database:"
        echo "$DB_OUTPUT"
        exit 1
    fi
fi

# Run database migrations
echo ""
echo "🔄 Running database migrations..."
if wrangler d1 execute nft-exchange --file=./schema.sql; then
    echo "✅ Database schema created successfully!"
else
    echo "❌ Failed to create database schema"
    echo "   Make sure schema.sql exists in the project root"
    exit 1
fi

# Create R2 bucket for images
echo ""
echo "🪣 Creating R2 bucket for image storage..."
R2_OUTPUT=$(wrangler r2 bucket create nft-exchange-images 2>&1)

if echo "$R2_OUTPUT" | grep -q "Created bucket"; then
    echo "✅ R2 bucket created successfully!"
elif echo "$R2_OUTPUT" | grep -q "already exists"; then
    echo "⚠️  R2 bucket 'nft-exchange-images' already exists"
else
    echo "⚠️  Could not create R2 bucket (you may need to enable R2 in your Cloudflare account)"
fi

echo ""
echo "🎉 Database setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Add your Alchemy API key to wrangler.toml"
echo "2. Deploy the smart contract and add its address to wrangler.toml"
echo "3. Run 'bun run dev' to start the development server"
echo ""