-- Clean up duplicate activities - keep only the first one (lowest id)
DELETE FROM activity
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM activity
  WHERE tx_hash IS NOT NULL
  GROUP BY tx_hash, type
)
AND tx_hash IS NOT NULL;

-- Clean up duplicate listings - keep only the first one (lowest id)
DELETE FROM listings
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM listings
  WHERE blockchain_listing_id IS NOT NULL
  GROUP BY blockchain_listing_id
)
AND blockchain_listing_id IS NOT NULL;

-- Clean up duplicate offers - keep only the first one (lowest id)
DELETE FROM offers
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM offers
  WHERE blockchain_offer_id IS NOT NULL
  GROUP BY blockchain_offer_id
)
AND blockchain_offer_id IS NOT NULL;