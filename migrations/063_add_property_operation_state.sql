-- =============================================================================
-- Migration: 063_add_property_operation_state.sql
-- Description: Add operation lifecycle state to properties
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'property_operation_state'
          AND n.nspname = 'public'
    ) THEN
        CREATE TYPE property_operation_state AS ENUM ('available', 'rented', 'leased', 'sold');
    END IF;
END $$;

ALTER TYPE property_operation_state ADD VALUE IF NOT EXISTS 'available';
ALTER TYPE property_operation_state ADD VALUE IF NOT EXISTS 'rented';
ALTER TYPE property_operation_state ADD VALUE IF NOT EXISTS 'leased';
ALTER TYPE property_operation_state ADD VALUE IF NOT EXISTS 'sold';

ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS operation_state property_operation_state;

UPDATE properties p
SET operation_state = CASE
    WHEN EXISTS (
        SELECT 1
        FROM leases l
        JOIN units u ON u.id = l.unit_id
        WHERE u.property_id = p.id
          AND l.status = 'active'
          AND l.deleted_at IS NULL
    ) THEN CASE
        WHEN p.operations @> ARRAY['leasing'::property_operation]
             AND NOT (p.operations @> ARRAY['rent'::property_operation])
        THEN 'leased'::property_operation_state
        ELSE 'rented'::property_operation_state
    END
    ELSE 'available'::property_operation_state
END
WHERE p.operation_state IS NULL;

ALTER TABLE properties
    ALTER COLUMN operation_state SET DEFAULT 'available',
    ALTER COLUMN operation_state SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_operation_state
    ON properties(operation_state);
