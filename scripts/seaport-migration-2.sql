-- Migration script to add contract_type column to activity table
-- This migration adds support for tracking which contract type (nft_exchange or seaport) was used for each activity

-- Add contract_type column to activity table
ALTER TABLE activity 
ADD COLUMN contract_type TEXT CHECK(contract_type IN ('nft_exchange', 'seaport')) DEFAULT 'nft_exchange';

-- Update existing activities to have the correct contract type
-- Since all existing activities are from NFTExchange, they should already have the default value

-- For future reference: If we need to update based on metadata or other criteria:
-- UPDATE activity 
-- SET contract_type = 'seaport' 
-- WHERE metadata LIKE '%"contract_type":"seaport"%';

-- Create index for contract_type to improve query performance
CREATE INDEX idx_activity_contract_type ON activity(contract_type);

-- Verify the migration
-- SELECT COUNT(*) as nft_exchange_count FROM activity WHERE contract_type = 'nft_exchange';
-- SELECT COUNT(*) as seaport_count FROM activity WHERE contract_type = 'seaport';
-- SELECT COUNT(*) as null_count FROM activity WHERE contract_type IS NULL;