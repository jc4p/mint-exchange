-- Check for duplicate activities
SELECT 'DUPLICATE ACTIVITIES:' as info;
SELECT tx_hash, type, COUNT(*) as count
FROM activity
WHERE tx_hash IS NOT NULL
GROUP BY tx_hash, type
HAVING COUNT(*) > 1;

-- Check for duplicate listings
SELECT '---' as separator;
SELECT 'DUPLICATE LISTINGS:' as info;
SELECT blockchain_listing_id, COUNT(*) as count
FROM listings
WHERE blockchain_listing_id IS NOT NULL
GROUP BY blockchain_listing_id
HAVING COUNT(*) > 1;

-- Check for duplicate offers
SELECT '---' as separator;
SELECT 'DUPLICATE OFFERS:' as info;
SELECT blockchain_offer_id, COUNT(*) as count
FROM offers
WHERE blockchain_offer_id IS NOT NULL
GROUP BY blockchain_offer_id
HAVING COUNT(*) > 1;