-- Migration to add support for NFTExchange v2 contract type
-- This handles views that depend on the activity table

-- Step 1: Drop dependent views
DROP VIEW IF EXISTS user_activity_summary;

-- Step 2: Create new activity table with updated constraint
CREATE TABLE activity_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT CHECK(type IN ('listing_created', 'offer_made', 'sale', 'offer_accepted', 'listing_cancelled', 'offer_cancelled')) NOT NULL,
    actor_fid INTEGER, 
    actor_address VARCHAR(42) NOT NULL, 
    nft_contract VARCHAR(42) NOT NULL,
    token_id VARCHAR(78) NOT NULL,
    price DECIMAL(36, 18),
    metadata TEXT, 
    tx_hash VARCHAR(66), 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    contract_type TEXT CHECK(contract_type IN ('nft_exchange', 'nft_exchange_v2', 'seaport')) DEFAULT 'nft_exchange',
    FOREIGN KEY (actor_fid) REFERENCES users(fid)
);

-- Step 3: Copy existing data
INSERT INTO activity_new SELECT * FROM activity;

-- Step 4: Drop old table and rename new one
DROP TABLE activity;
ALTER TABLE activity_new RENAME TO activity;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_nft_activity ON activity(nft_contract, token_id);
CREATE INDEX IF NOT EXISTS idx_actor_fid_activity ON activity(actor_fid);
CREATE INDEX IF NOT EXISTS idx_actor_address_activity ON activity(actor_address);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity(type);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity(created_at DESC);

-- Step 6: Recreate the view
CREATE VIEW user_activity_summary AS
SELECT 
  actor_fid,
  type,
  COUNT(*) as count,
  MAX(created_at) as last_activity
FROM activity
WHERE actor_fid IS NOT NULL
GROUP BY actor_fid, type;

-- Step 7: Create index for nft_exchange_v2 listings
CREATE INDEX IF NOT EXISTS idx_listings_nft_exchange_v2 
    ON listings(contract_type) 
    WHERE contract_type = 'nft_exchange_v2';

-- Add unique constraint to prevent duplicate order hashes within the same contract type
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_order_hash_per_contract
    ON listings(order_hash, contract_type)
    WHERE order_hash IS NOT NULL;