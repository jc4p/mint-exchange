-- Check how many listings have seller_address but no seller_fid
SELECT 
  COUNT(*) as total_without_fid,
  COUNT(CASE WHEN sold_at IS NOT NULL THEN 1 END) as sold_without_fid
FROM listings
WHERE seller_address IS NOT NULL 
  AND seller_fid IS NULL;

-- Show some examples
SELECT 
  id, 
  seller_address, 
  seller_fid, 
  created_at, 
  sold_at,
  contract_type
FROM listings
WHERE seller_address IS NOT NULL 
  AND seller_fid IS NULL
LIMIT 10;

-- To fix: Update seller_fid based on seller_address matching user addresses
-- This would need to be done by matching addresses to FIDs through Neynar API
-- For now, just documenting the issue