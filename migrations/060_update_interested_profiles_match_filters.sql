-- =============================================================================
-- Migration: 060_update_interested_profiles_match_filters.sql
-- Description: Extend interested profile filters for matching and persistence
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'interested_property_type'
          AND n.nspname = 'public'
    ) THEN
        CREATE TYPE interested_property_type AS ENUM (
            'apartment', 'house', 'commercial', 'office', 'warehouse', 'land', 'parking', 'other'
        );
    END IF;
END $$;

ALTER TYPE interested_property_type ADD VALUE IF NOT EXISTS 'commercial';
ALTER TYPE interested_property_type ADD VALUE IF NOT EXISTS 'office';
ALTER TYPE interested_property_type ADD VALUE IF NOT EXISTS 'warehouse';
ALTER TYPE interested_property_type ADD VALUE IF NOT EXISTS 'land';
ALTER TYPE interested_property_type ADD VALUE IF NOT EXISTS 'parking';
ALTER TYPE interested_property_type ADD VALUE IF NOT EXISTS 'other';

ALTER TABLE interested_profiles
    ADD COLUMN IF NOT EXISTS min_amount DECIMAL(12, 2),
    ADD COLUMN IF NOT EXISTS preferred_city VARCHAR(120),
    ADD COLUMN IF NOT EXISTS desired_features TEXT[];

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'interested_profiles_min_amount_check'
    ) THEN
        ALTER TABLE interested_profiles
            ADD CONSTRAINT interested_profiles_min_amount_check
            CHECK (min_amount IS NULL OR min_amount >= 0);
    END IF;
END $$;
