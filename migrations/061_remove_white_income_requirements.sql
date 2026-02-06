-- =============================================================================
-- Migration: 061_remove_white_income_requirements.sql
-- Description: Remove white income requirement fields from CRM and properties
-- =============================================================================

ALTER TABLE interested_profiles
    DROP COLUMN IF EXISTS white_income;

ALTER TABLE properties
    DROP COLUMN IF EXISTS requires_white_income;
