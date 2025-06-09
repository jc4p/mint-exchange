-- NFT Exchange Database Schema for Cloudflare D1
-- FID-centric design where FID (Farcaster ID) is the primary user identifier

-- Users table to store Farcaster user data
CREATE TABLE users (
  fid INTEGER PRIMARY KEY,
  username VARCHAR(255),
  display_name VARCHAR(255),
  pfp_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Listings table to store NFT marketplace listings
CREATE TABLE listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blockchain_listing_id VARCHAR(78), -- The listing ID from the smart contract
  seller_fid INTEGER, -- FID of the seller
  seller_address VARCHAR(42) NOT NULL, -- Address that created the listing onchain
  nft_contract VARCHAR(42) NOT NULL,
  token_id VARCHAR(78) NOT NULL,
  price DECIMAL(36, 18) NOT NULL,
  expiry TIMESTAMP NOT NULL,
  metadata_uri TEXT,
  image_url TEXT,
  name VARCHAR(255),
  description TEXT,
  tx_hash VARCHAR(66), -- Transaction hash from blockchain
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sold_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  buyer_fid INTEGER, -- FID of the buyer
  buyer_address VARCHAR(42), -- Address that bought onchain
  sale_tx_hash VARCHAR(66),
  cancel_tx_hash VARCHAR(66),
  FOREIGN KEY (seller_fid) REFERENCES users(fid),
  FOREIGN KEY (buyer_fid) REFERENCES users(fid)
);

-- Indexes for efficient querying
CREATE INDEX idx_active_listings ON listings(expiry, sold_at, cancelled_at);
CREATE INDEX idx_collection ON listings(nft_contract);
CREATE INDEX idx_seller_fid ON listings(seller_fid);
CREATE INDEX idx_buyer_fid ON listings(buyer_fid);
CREATE INDEX idx_blockchain_listing ON listings(blockchain_listing_id);
CREATE INDEX idx_seller_address ON listings(seller_address);

-- New columns for Seaport listings
ALTER TABLE listings ADD COLUMN contract_type VARCHAR(20) DEFAULT 'nft_exchange';
ALTER TABLE listings ADD COLUMN order_hash VARCHAR(66);
ALTER TABLE listings ADD COLUMN order_parameters TEXT;
ALTER TABLE listings ADD COLUMN zone_address VARCHAR(42);
ALTER TABLE listings ADD COLUMN conduit_key VARCHAR(66);
ALTER TABLE listings ADD COLUMN salt VARCHAR(66);
ALTER TABLE listings ADD COLUMN counter INTEGER;

-- Indexes for new columns
CREATE INDEX idx_listings_contract_type ON listings(contract_type);
CREATE INDEX idx_listings_order_hash ON listings(order_hash) WHERE order_hash IS NOT NULL;

-- Offers table to track offers made on NFTs
CREATE TABLE offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blockchain_offer_id VARCHAR(78), -- The offer ID from the smart contract
  buyer_fid INTEGER, -- FID of the offer maker
  buyer_address VARCHAR(42) NOT NULL, -- Address that made the offer onchain
  nft_contract VARCHAR(42) NOT NULL,
  token_id VARCHAR(78) NOT NULL,
  amount DECIMAL(36, 18) NOT NULL,
  expiry TIMESTAMP NOT NULL,
  tx_hash VARCHAR(66), -- Transaction hash from blockchain
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  seller_fid INTEGER, -- FID of the seller who accepted
  seller_address VARCHAR(42), -- Address that accepted onchain
  accept_tx_hash VARCHAR(66),
  cancel_tx_hash VARCHAR(66),
  FOREIGN KEY (buyer_fid) REFERENCES users(fid),
  FOREIGN KEY (seller_fid) REFERENCES users(fid)
);

-- Index for finding offers on specific NFTs
CREATE INDEX idx_nft_offers ON offers(nft_contract, token_id);
CREATE INDEX idx_buyer_fid_offers ON offers(buyer_fid);
CREATE INDEX idx_seller_fid_offers ON offers(seller_fid);
CREATE INDEX idx_blockchain_offer ON offers(blockchain_offer_id);
CREATE INDEX idx_buyer_address_offers ON offers(buyer_address);

-- Activity table to track all marketplace events
CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT CHECK(type IN ('listing_created', 'offer_made', 'sale', 'offer_accepted', 'listing_cancelled', 'offer_cancelled')) NOT NULL,
  actor_fid INTEGER, -- FID of the user who performed the action
  actor_address VARCHAR(42) NOT NULL, -- Address that performed the action onchain
  nft_contract VARCHAR(42) NOT NULL,
  token_id VARCHAR(78) NOT NULL,
  price DECIMAL(36, 18),
  metadata TEXT, -- JSON metadata for additional context
  tx_hash VARCHAR(66), -- Transaction hash for this activity
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_fid) REFERENCES users(fid)
);

-- Indexes for activity queries
CREATE INDEX idx_nft_activity ON activity(nft_contract, token_id);
CREATE INDEX idx_actor_fid_activity ON activity(actor_fid);
CREATE INDEX idx_actor_address_activity ON activity(actor_address);
CREATE INDEX idx_activity_type ON activity(type);
CREATE INDEX idx_activity_time ON activity(created_at DESC);

-- Indexed blocks table for blockchain event tracking
CREATE TABLE indexed_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block_number INTEGER NOT NULL,
  indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on block number for fast lookups
CREATE INDEX idx_block_number ON indexed_blocks(block_number);

-- Create a view for active listings with user info
CREATE VIEW active_listings_with_users AS
SELECT 
  l.*,
  u.username as seller_username,
  u.display_name as seller_display_name,
  u.pfp_url as seller_pfp_url
FROM listings l
LEFT JOIN users u ON l.seller_fid = u.fid
WHERE l.sold_at IS NULL 
  AND l.cancelled_at IS NULL 
  AND l.expiry > datetime('now');

-- Create a view for user activity summary by FID
CREATE VIEW user_activity_summary AS
SELECT 
  actor_fid,
  type,
  COUNT(*) as count,
  MAX(created_at) as last_activity
FROM activity
WHERE actor_fid IS NOT NULL
GROUP BY actor_fid, type;

-- Create a view for user stats by FID
CREATE VIEW user_stats AS
SELECT 
  u.fid,
  u.username,
  u.display_name,
  (SELECT COUNT(*) FROM listings WHERE seller_fid = u.fid) as total_listings,
  (SELECT COUNT(*) FROM listings WHERE seller_fid = u.fid AND sold_at IS NOT NULL) as total_sold,
  (SELECT COUNT(*) FROM listings WHERE buyer_fid = u.fid) as total_purchased,
  (SELECT COUNT(*) FROM offers WHERE buyer_fid = u.fid) as total_offers_made,
  (SELECT COUNT(*) FROM offers WHERE seller_fid = u.fid AND accepted_at IS NOT NULL) as total_offers_received
FROM users u;