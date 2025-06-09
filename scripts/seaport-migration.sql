-- Migration script to add Seaport-specific columns to an existing 'listings' table.
-- This script is intended for databases created BEFORE these columns were part of the main schema.sql's CREATE TABLE definition.

ALTER TABLE listings ADD COLUMN contract_type VARCHAR(20) DEFAULT 'nft_exchange';
ALTER TABLE listings ADD COLUMN order_hash VARCHAR(66);
ALTER TABLE listings ADD COLUMN order_parameters TEXT;
ALTER TABLE listings ADD COLUMN zone_address VARCHAR(42);
ALTER TABLE listings ADD COLUMN conduit_key VARCHAR(66);
ALTER TABLE listings ADD COLUMN salt VARCHAR(66);
ALTER TABLE listings ADD COLUMN counter INTEGER;

-- It's good practice to ensure indexes are also created if they weren't part of the older schema.
-- The main schema.sql should ideally handle index creation for new setups.
-- These are here for completeness if migrating a very old schema that also lacked these indexes.
-- For D1, `CREATE INDEX IF NOT EXISTS` is not supported directly in basic wrangler execute --file.
-- Admin should ensure these are run only if needed or manage index creation separately.
-- A more robust migration system would handle conditional index creation.

-- CREATE INDEX idx_listings_contract_type ON listings(contract_type);
-- CREATE INDEX idx_listings_order_hash ON listings(order_hash) WHERE order_hash IS NOT NULL;
