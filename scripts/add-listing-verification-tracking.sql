-- Migration to add listing verification tracking
-- This tracks when listings were last verified on-chain to avoid checking the same ones repeatedly

-- Create verification tracking table
CREATE TABLE IF NOT EXISTS listing_verifications (
    listing_id INTEGER PRIMARY KEY,
    last_verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verification_count INTEGER DEFAULT 1,
    last_status TEXT, -- 'active', 'sold', 'cancelled', 'expired', 'not_found', 'error'
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_verification_time ON listing_verifications(last_verified_at);

-- Optional: Create a view to make querying easier
CREATE VIEW IF NOT EXISTS listings_with_verification AS
SELECT 
    l.*,
    lv.last_verified_at,
    lv.verification_count,
    lv.last_status as last_verification_status
FROM listings l
LEFT JOIN listing_verifications lv ON l.id = lv.listing_id;