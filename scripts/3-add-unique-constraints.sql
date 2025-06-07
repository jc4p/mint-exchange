-- Migration script to add unique constraints to prevent duplicate listings and activities

-- Add unique constraint for blockchain_listing_id
-- This prevents the same blockchain listing from being indexed multiple times
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_blockchain_listing 
ON listings(blockchain_listing_id) 
WHERE blockchain_listing_id IS NOT NULL;

-- Add unique constraint for active listings per NFT
-- This prevents multiple active listings for the same NFT
-- Note: SQLite doesn't support partial unique constraints well, so we'll handle this in application logic

-- Add unique constraint for activities to prevent duplicate transaction recordings
-- This prevents the same transaction from creating multiple activity records of the same type
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_activity_tx 
ON activity(tx_hash, type) 
WHERE tx_hash IS NOT NULL;

-- Add index for finding active listings by NFT
CREATE INDEX IF NOT EXISTS idx_active_nft_listings 
ON listings(nft_contract, token_id, sold_at, cancelled_at, expiry);

-- Add unique constraint for blockchain_offer_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_blockchain_offer 
ON offers(blockchain_offer_id) 
WHERE blockchain_offer_id IS NOT NULL;