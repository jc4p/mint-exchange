-- Script to clean up duplicate entries and add unique constraints

-- First, let's see what duplicates we have in activity table
SELECT tx_hash, type, COUNT(*) as count
FROM activity
WHERE tx_hash IS NOT NULL
GROUP BY tx_hash, type
HAVING COUNT(*) > 1;

-- Clean up duplicate activities - keep only the first one (lowest id)
DELETE FROM activity
WHERE id NOT IN (
  SELECT MIN(id)
  FROM activity
  GROUP BY tx_hash, type
)
AND tx_hash IS NOT NULL;

-- Check for duplicate listings by blockchain_listing_id
SELECT blockchain_listing_id, COUNT(*) as count
FROM listings
WHERE blockchain_listing_id IS NOT NULL
GROUP BY blockchain_listing_id
HAVING COUNT(*) > 1;

-- Clean up duplicate listings - keep only the first one (lowest id)
DELETE FROM listings
WHERE id NOT IN (
  SELECT MIN(id)
  FROM listings
  GROUP BY blockchain_listing_id
)
AND blockchain_listing_id IS NOT NULL;

-- Check for duplicate offers by blockchain_offer_id
SELECT blockchain_offer_id, COUNT(*) as count
FROM offers
WHERE blockchain_offer_id IS NOT NULL
GROUP BY blockchain_offer_id
HAVING COUNT(*) > 1;

-- Clean up duplicate offers - keep only the first one (lowest id)
DELETE FROM offers
WHERE id NOT IN (
  SELECT MIN(id)
  FROM offers
  GROUP BY blockchain_offer_id
)
AND blockchain_offer_id IS NOT NULL;

-- Now add the unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_blockchain_listing 
ON listings(blockchain_listing_id) 
WHERE blockchain_listing_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_activity_tx 
ON activity(tx_hash, type) 
WHERE tx_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_blockchain_offer 
ON offers(blockchain_offer_id) 
WHERE blockchain_offer_id IS NOT NULL;

-- Add index for finding active listings by NFT
CREATE INDEX IF NOT EXISTS idx_active_nft_listings 
ON listings(nft_contract, token_id, sold_at, cancelled_at, expiry);

-- Show summary of cleanup
SELECT 'Cleanup complete!' as status;
SELECT 'Activity table: ' || COUNT(*) || ' records remaining' as info FROM activity;
SELECT 'Listings table: ' || COUNT(*) || ' records remaining' as info FROM listings;
SELECT 'Offers table: ' || COUNT(*) || ' records remaining' as info FROM offers;