-- Add share_image_url column to listings table
-- This column will store the generated share image URL for each listing

-- Add the new column
ALTER TABLE listings ADD COLUMN share_image_url TEXT;

-- Create an index for faster lookups when checking if share image exists
CREATE INDEX idx_share_image_url ON listings(share_image_url);

-- Update the active_listings_with_users view to include share_image_url
DROP VIEW IF EXISTS active_listings_with_users;

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