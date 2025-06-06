# Database Setup Guide

This guide will help you set up the Cloudflare D1 database for the NFT Exchange.

## Prerequisites

1. **Cloudflare Account**: You need a Cloudflare account with Workers enabled
2. **Wrangler CLI**: Install if not already installed:
   ```bash
   npm install -g wrangler
   ```
3. **Authentication**: Login to Cloudflare:
   ```bash
   wrangler login
   ```

## Quick Setup

Run the automated setup script:

```bash
bash scripts/setup-database.sh
```

This script will:
- Create the D1 database named `nft-exchange`
- Update `wrangler.toml` with the database ID
- Run the schema migrations
- Create the R2 bucket for image storage

## Manual Setup

If you prefer to set up manually or the script fails:

### 1. Create D1 Database

```bash
wrangler d1 create nft-exchange
```

Copy the `database_id` from the output and update it in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "nft-exchange"
database_id = "YOUR_DATABASE_ID_HERE"
```

### 2. Run Schema Migration

```bash
wrangler d1 execute nft-exchange --file=./schema.sql
```

### 3. Create R2 Bucket (Optional)

```bash
wrangler r2 bucket create nft-exchange-images
```

## Database Schema

The database includes the following tables:

- **users**: Farcaster user profiles and wallet addresses
- **listings**: NFT marketplace listings
- **offers**: Offers made on NFTs
- **activity**: All marketplace events (sales, listings, etc.)
- **indexed_blocks**: For blockchain event tracking

## Testing the Database

You can test the database connection by running:

```bash
# Start the dev server
bun run dev

# In another terminal, test the API
curl http://localhost:8787/api/listings
```

If the database is properly connected, you'll see an empty listings array. If not configured, the API will fall back to mock data.

## Adding Test Data

To add test data to your database:

```bash
# Create a test listing
wrangler d1 execute nft-exchange --command "INSERT INTO listings (listing_id, seller_address, nft_contract, token_id, price, expiry, name, image_url) VALUES (1, '0x1234567890123456789012345678901234567890', '0xabcdef1234567890abcdef1234567890abcdef12', '1', 10.5, datetime('now', '+7 days'), 'Test NFT #1', 'https://picsum.photos/400/400')"
```

## Environment Variables

Add these to your `wrangler.toml` or as secrets:

```bash
# Add Alchemy API key (for NFT data)
wrangler secret put ALCHEMY_API_KEY

# Add contract address after deployment
# Update CONTRACT_ADDRESS in wrangler.toml
```

## Troubleshooting

### Database not found error
- Ensure the database_id in wrangler.toml matches your created database
- Run `wrangler d1 list` to see all your databases

### Permission errors
- Make sure you're logged in: `wrangler login`
- Check your account has D1 access enabled

### Schema errors
- Ensure schema.sql exists in the project root
- Check for SQL syntax errors in the schema file

## Next Steps

After setting up the database:
1. Add your Alchemy API key for NFT data fetching
2. Deploy the smart contract and add its address
3. Implement Farcaster authentication
4. Start adding real NFT listings!