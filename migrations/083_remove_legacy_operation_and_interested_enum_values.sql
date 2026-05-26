-- =============================================================================
-- Migration: 083_remove_legacy_operation_and_interested_enum_values.sql
-- Description: Rebuild operation and interested status enums to match current
--              runtime contracts exactly, removing legacy values after mapping.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Property operation enum: remove legacy 'leasing'
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _map_property_operations_to_text(input property_operation[])
RETURNS TEXT[] AS $$
    SELECT COALESCE(
        ARRAY(
            SELECT CASE item::TEXT
                WHEN 'leasing' THEN 'rent'
                WHEN 'rent' THEN 'rent'
                WHEN 'sale' THEN 'sale'
                ELSE 'rent'
            END
            FROM unnest(input) AS item
        ),
        ARRAY[]::TEXT[]
    );
$$ LANGUAGE SQL IMMUTABLE;

ALTER TABLE properties
    ALTER COLUMN operations DROP DEFAULT,
    ALTER COLUMN operations TYPE TEXT[]
    USING _map_property_operations_to_text(operations);

DROP FUNCTION _map_property_operations_to_text(property_operation[]);

DROP TYPE IF EXISTS property_operation;
CREATE TYPE property_operation AS ENUM ('rent', 'sale');

ALTER TABLE properties
    ALTER COLUMN operations TYPE property_operation[]
    USING operations::property_operation[],
    ALTER COLUMN operations SET DEFAULT ARRAY['rent']::property_operation[];

-- -----------------------------------------------------------------------------
-- Property operation state enum: remove legacy 'leased'
-- -----------------------------------------------------------------------------
ALTER TABLE properties
    ALTER COLUMN operation_state DROP DEFAULT,
    ALTER COLUMN operation_state TYPE TEXT
    USING CASE operation_state::TEXT
        WHEN 'leased' THEN 'rented'
        WHEN 'available' THEN 'available'
        WHEN 'rented' THEN 'rented'
        WHEN 'reserved' THEN 'reserved'
        WHEN 'sold' THEN 'sold'
        ELSE 'available'
    END;

DROP TYPE IF EXISTS property_operation_state;
CREATE TYPE property_operation_state AS ENUM (
    'available',
    'rented',
    'reserved',
    'sold'
);

ALTER TABLE properties
    ALTER COLUMN operation_state TYPE property_operation_state
    USING operation_state::property_operation_state,
    ALTER COLUMN operation_state SET DEFAULT 'available';

-- -----------------------------------------------------------------------------
-- Interested operation enum: remove legacy 'leasing'
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _map_interested_operations_to_text(input interested_operation[])
RETURNS TEXT[] AS $$
    SELECT COALESCE(
        ARRAY(
            SELECT CASE item::TEXT
                WHEN 'leasing' THEN 'rent'
                WHEN 'rent' THEN 'rent'
                WHEN 'sale' THEN 'sale'
                ELSE 'rent'
            END
            FROM unnest(input) AS item
        ),
        ARRAY[]::TEXT[]
    );
$$ LANGUAGE SQL IMMUTABLE;

ALTER TABLE interested_profiles
    ALTER COLUMN operation DROP DEFAULT,
    ALTER COLUMN operation TYPE TEXT
    USING CASE operation::TEXT
        WHEN 'leasing' THEN 'rent'
        WHEN 'rent' THEN 'rent'
        WHEN 'sale' THEN 'sale'
        ELSE 'rent'
    END,
    ALTER COLUMN operations DROP DEFAULT,
    ALTER COLUMN operations TYPE TEXT[]
    USING _map_interested_operations_to_text(operations);

DROP FUNCTION _map_interested_operations_to_text(interested_operation[]);

DROP TYPE IF EXISTS interested_operation;
CREATE TYPE interested_operation AS ENUM ('rent', 'sale');

ALTER TABLE interested_profiles
    ALTER COLUMN operation TYPE interested_operation
    USING operation::interested_operation,
    ALTER COLUMN operation SET DEFAULT 'rent',
    ALTER COLUMN operations TYPE interested_operation[]
    USING operations::interested_operation[],
    ALTER COLUMN operations SET DEFAULT ARRAY['rent']::interested_operation[];

-- -----------------------------------------------------------------------------
-- Interested status enum: remove historical CRM stages now represented
-- elsewhere by activities/matches/reservations.
-- -----------------------------------------------------------------------------
ALTER TABLE interested_profiles
    ALTER COLUMN status DROP DEFAULT,
    ALTER COLUMN status TYPE TEXT
    USING CASE status::TEXT
        WHEN 'tenant' THEN 'tenant'
        WHEN 'buyer' THEN 'buyer'
        WHEN 'won' THEN
            CASE
                WHEN converted_to_tenant_id IS NOT NULL THEN 'tenant'
                WHEN converted_to_buyer_id IS NOT NULL OR converted_to_sale_agreement_id IS NOT NULL THEN 'buyer'
                ELSE 'interested'
            END
        ELSE 'interested'
    END;

ALTER TABLE interested_stage_history
    ALTER COLUMN from_status TYPE TEXT
    USING CASE from_status::TEXT
        WHEN 'tenant' THEN 'tenant'
        WHEN 'buyer' THEN 'buyer'
        WHEN 'won' THEN 'interested'
        ELSE 'interested'
    END,
    ALTER COLUMN to_status TYPE TEXT
    USING CASE to_status::TEXT
        WHEN 'tenant' THEN 'tenant'
        WHEN 'buyer' THEN 'buyer'
        WHEN 'won' THEN 'interested'
        ELSE 'interested'
    END;

DROP TYPE IF EXISTS interested_status;
CREATE TYPE interested_status AS ENUM ('interested', 'tenant', 'buyer');

ALTER TABLE interested_profiles
    ALTER COLUMN status TYPE interested_status
    USING status::interested_status,
    ALTER COLUMN status SET DEFAULT 'interested';

ALTER TABLE interested_stage_history
    ALTER COLUMN from_status TYPE interested_status
    USING from_status::interested_status,
    ALTER COLUMN to_status TYPE interested_status
    USING to_status::interested_status;
