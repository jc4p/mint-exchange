-- First, identify duplicate tx_hash entries in listings
SELECT 
    tx_hash, 
    COUNT(*) as count,
    GROUP_CONCAT(id) as listing_ids,
    GROUP_CONCAT(blockchain_listing_id) as blockchain_ids,
    GROUP_CONCAT(nft_contract || ':' || token_id) as nfts
FROM listings
WHERE tx_hash IS NOT NULL
GROUP BY tx_hash
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- Remove duplicate listings with same tx_hash, keeping the one with blockchain_listing_id
-- or the lowest id if multiple have blockchain_listing_id
DELETE FROM listings
WHERE id IN (
    SELECT id FROM (
        SELECT 
            l1.id,
            l1.tx_hash,
            l1.blockchain_listing_id,
            -- Rank duplicates: prefer ones with blockchain_listing_id, then by lowest id
            ROW_NUMBER() OVER (
                PARTITION BY l1.tx_hash 
                ORDER BY 
                    CASE WHEN l1.blockchain_listing_id IS NOT NULL THEN 0 ELSE 1 END,
                    l1.id
            ) as rn
        FROM listings l1
        WHERE l1.tx_hash IS NOT NULL
        AND EXISTS (
            SELECT 1 
            FROM listings l2 
            WHERE l2.tx_hash = l1.tx_hash 
            AND l2.id != l1.id
        )
    ) ranked
    WHERE rn > 1
);

-- Verify the cleanup worked
SELECT 
    tx_hash, 
    COUNT(*) as count
FROM listings
WHERE tx_hash IS NOT NULL
GROUP BY tx_hash
HAVING COUNT(*) > 1;