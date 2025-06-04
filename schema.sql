-- NFT Exchange Database Schema for Cloudflare D1
-- This schema defines all tables needed for the FC NFT Exchange marketplace

-- Users table to store Farcaster user data
CREATE TABLE users (
  fid INTEGER PRIMARY KEY,
  username VARCHAR(255),
  display_name VARCHAR(255),
  pfp_url TEXT,
  wallet_address VARCHAR(42),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for wallet address lookups
CREATE INDEX idx_users_wallet ON users(wallet_address);

-- Listings table to store NFT marketplace listings
CREATE TABLE listings (
  listing_id INTEGER PRIMARY KEY,
  seller_address VARCHAR(42),
  nft_contract VARCHAR(42),
  token_id VARCHAR(78),
  price DECIMAL(36, 18),
  expiry TIMESTAMP,
  metadata_uri TEXT,
  image_url TEXT,
  name VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sold_at TIMESTAMP,
  cancelled_at TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX idx_active_listings ON listings(expiry, sold_at, cancelled_at);
CREATE INDEX idx_collection ON listings(nft_contract);
CREATE INDEX idx_seller ON listings(seller_address);

-- Offers table to track offers made on NFTs
CREATE TABLE offers (
  offer_id INTEGER PRIMARY KEY,
  buyer_address VARCHAR(42),
  nft_contract VARCHAR(42),
  token_id VARCHAR(78),
  amount DECIMAL(36, 18),
  expiry TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP,
  cancelled_at TIMESTAMP
);

-- Index for finding offers on specific NFTs
CREATE INDEX idx_nft_offers ON offers(nft_contract, token_id);
CREATE INDEX idx_buyer_offers ON offers(buyer_address);

-- Activity table to track all marketplace events
CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT CHECK(type IN ('listing_created', 'offer_made', 'sale', 'offer_accepted', 'listing_cancelled', 'offer_cancelled')),
  actor_address VARCHAR(42),
  nft_contract VARCHAR(42),
  token_id VARCHAR(78),
  price DECIMAL(36, 18),
  metadata TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for activity queries
CREATE INDEX idx_nft_activity ON activity(nft_contract, token_id);
CREATE INDEX idx_actor_activity ON activity(actor_address);
CREATE INDEX idx_activity_type ON activity(type);
CREATE INDEX idx_activity_time ON activity(created_at DESC);

-- Indexed blocks table for blockchain event tracking
CREATE TABLE indexed_blocks (
  id INTEGER PRIMARY KEY,
  block_number INTEGER NOT NULL
);

-- Create a view for active listings (convenience)
CREATE VIEW active_listings AS
SELECT * FROM listings 
WHERE sold_at IS NULL 
  AND cancelled_at IS NULL 
  AND expiry > datetime('now');

-- Create a view for user activity summary
CREATE VIEW user_activity_summary AS
SELECT 
  actor_address,
  type,
  COUNT(*) as count,
  MAX(created_at) as last_activity
FROM activity
GROUP BY actor_address, type;