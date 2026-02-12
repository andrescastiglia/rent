-- =============================================================================
-- Migration: 070_add_property_rent_price.sql
-- Description: Add optional rent_price to properties and backfill from unit rents
-- =============================================================================

ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS rent_price numeric(12, 2);

UPDATE properties p
SET rent_price = source.min_rent
FROM (
    SELECT u.property_id, MIN(u.base_rent)::numeric(12, 2) AS min_rent
    FROM units u
    WHERE u.deleted_at IS NULL
      AND u.base_rent IS NOT NULL
    GROUP BY u.property_id
) source
WHERE p.id = source.property_id
  AND p.rent_price IS NULL;

CREATE INDEX IF NOT EXISTS idx_properties_rent_price
    ON properties (rent_price);
