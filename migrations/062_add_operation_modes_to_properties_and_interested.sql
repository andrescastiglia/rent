-- =============================================================================
-- Migration: 062_add_operation_modes_to_properties_and_interested.sql
-- Description: Add rent/sale/leasing operation modes for properties and prospects
-- =============================================================================

ALTER TYPE interested_operation ADD VALUE IF NOT EXISTS 'leasing';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'property_operation'
          AND n.nspname = 'public'
    ) THEN
        CREATE TYPE property_operation AS ENUM ('rent', 'sale', 'leasing');
    END IF;
END $$;

ALTER TYPE property_operation ADD VALUE IF NOT EXISTS 'rent';
ALTER TYPE property_operation ADD VALUE IF NOT EXISTS 'sale';
ALTER TYPE property_operation ADD VALUE IF NOT EXISTS 'leasing';

ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS operations property_operation[];

UPDATE properties
SET operations = CASE
    WHEN sale_price IS NOT NULL THEN ARRAY['rent'::property_operation, 'sale'::property_operation]
    ELSE ARRAY['rent'::property_operation]
END
WHERE operations IS NULL OR cardinality(operations) = 0;

ALTER TABLE properties
    ALTER COLUMN operations SET DEFAULT ARRAY['rent'::property_operation],
    ALTER COLUMN operations SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_operations
    ON properties USING GIN (operations);

ALTER TABLE interested_profiles
    ADD COLUMN IF NOT EXISTS operations interested_operation[];

UPDATE interested_profiles
SET operations = ARRAY[operation]
WHERE operation IS NOT NULL
  AND (operations IS NULL OR cardinality(operations) = 0);

UPDATE interested_profiles
SET operations = ARRAY['rent'::interested_operation]
WHERE operations IS NULL OR cardinality(operations) = 0;

ALTER TABLE interested_profiles
    ALTER COLUMN operations SET DEFAULT ARRAY['rent'::interested_operation],
    ALTER COLUMN operations SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interested_operations
    ON interested_profiles USING GIN (operations);

UPDATE interested_profiles
SET operation = operations[1]
WHERE operations IS NOT NULL
  AND cardinality(operations) > 0
  AND operation IS DISTINCT FROM operations[1];
