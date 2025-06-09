# Local Testing Instructions for Seaport Migration

## Prerequisites
1. Ensure you have Bun installed
2. Ensure you have access to a Base RPC endpoint (or configure one in wrangler.toml)
3. Have a Farcaster account with a connected wallet

## Setup Steps

### 1. Install Dependencies
```bash
bun install
```

### 2. Environment Configuration
Verify that `wrangler.toml` has all the required environment variables:
- `CONTRACT_ADDRESS`: NFT Exchange contract (0x06fB7424Ba65D587405b9C754Bc40dA9398B72F0)
- `USDC_ADDRESS`: USDC on Base (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
- `SEAPORT_CONTRACT_ADDRESS`: Seaport 1.6 on Base (0x0000000000000068F116a894984e2DB1123eB395)
- `FEE_RECIPIENT`: Fee recipient address (0x0db12C0A67bc5B8942ea3126a465d7a0b23126C7)
- `CHAIN_ID`: Base chain ID (8453)

### 3. Database Setup
```bash
# Run database migrations
wrangler d1 execute nft-exchange --local --file=./scripts/seaport-migration.sql
```

### 4. Start Development Server
```bash
bun run dev
```

This will start:
- Wrangler dev server on http://localhost:8787
- Vite build watcher for frontend changes

## Testing Workflow

### 1. Authentication
1. Navigate to http://localhost:8787
2. Click "Sign In" button
3. Complete Farcaster authentication

### 2. Creating a Seaport Listing
1. Click "List NFT" button
2. Select an NFT you own
3. Set a price in USDC
4. Set expiry days (default: 7)
5. Click "Create Listing"
6. Approve NFT for Seaport's conduit (if not already approved)
7. Sign the Seaport order with your wallet
8. Wait for transaction confirmation

**Expected Behavior:**
- Transaction manager returns both hash and order data
- Frontend sends full order parameters to backend
- Backend stores order data and calculates order hash
- Listing appears with `contractType: 'seaport'`

### 3. Viewing Listings
1. Navigate to home page or search
2. Seaport listings should display with:
   - Price in USDC
   - Seller information
   - NFT details
   - Contract type indicator

### 4. Buying a Seaport Listing
1. Click on a Seaport listing
2. Click "Buy Now"
3. Approve USDC spending (if needed)
4. Confirm the transaction

**Expected Behavior:**
- Frontend receives `orderData` field from backend
- SeaportAdapter uses orderData to fulfill order
- Transaction completes successfully
- Listing marked as sold

### 5. Cancelling a Seaport Listing
1. Go to your profile
2. Find an active Seaport listing
3. Click "Cancel Listing"
4. Confirm the cancellation transaction

**Expected Behavior:**
- Cancellation uses order hash
- Seaport OrderCancelled event is emitted
- Listing marked as cancelled

### 6. Backward Compatibility Testing
Verify that existing NFTExchange listings still work:
1. View NFTExchange listings (contractType: 'nft_exchange')
2. Buy an NFTExchange listing
3. Cancel an NFTExchange listing

## Debugging Tips

### Check Browser Console
- Look for "Seaport order data:" logs when creating listings
- Verify order parameters are being sent to backend
- Check for any adapter initialization errors

### Check Server Logs
- Verify orderParameters are received in POST /api/listings
- Check order hash calculation
- Verify database storage of Seaport fields

### Common Issues

1. **"orderParameters are required" error**
   - Ensure frontend is sending orderData from createListing result
   - Check that transaction manager returns full result object for Seaport

2. **"Cannot read orderData" when buying**
   - Verify backend returns parsed orderData field
   - Check listing response includes orderData for Seaport listings

3. **Approval issues**
   - Seaport uses a different conduit address than NFTExchange
   - Ensure NFT is approved for: 0x1E0049783F008A0085193E00003D00cd54003c71

4. **Network mismatch**
   - Ensure wallet is connected to Base (chain ID 8453)
   - Check RPC_URL in environment points to Base

## Event Indexing
The indexer runs every 2 minutes and processes both:
- NFTExchange events (ListingCreated, ListingSold, ListingCancelled)
- Seaport events (OrderFulfilled, OrderCancelled)

To manually trigger indexing:
```bash
curl http://localhost:8787/api/admin/index-events
```

## Database Verification
Check that Seaport listings have proper fields:
```sql
-- Via Wrangler D1
wrangler d1 execute nft-exchange --local --command="SELECT id, contract_type, order_hash, blockchain_listing_id FROM listings WHERE contract_type = 'seaport'"
```

## Testing Checklist
- [ ] Create Seaport listing with order data properly stored
- [ ] View Seaport listings with orderData field populated
- [ ] Buy Seaport listing successfully
- [ ] Cancel Seaport listing using order hash
- [ ] Existing NFTExchange listings still functional
- [ ] Event indexer processes both contract types
- [ ] Profile page shows mixed listing types
- [ ] Search works for both contract types