-- =============================================================================
-- Migration: 001_create_companies.sql
-- Description: Create companies table for organizations/enterprises
-- =============================================================================

-- Create ENUM for plan types
CREATE TYPE plan_type AS ENUM ('free', 'basic', 'premium', 'enterprise');

-- Create companies table
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(50) NOT NULL UNIQUE,
    plan_type plan_type NOT NULL DEFAULT 'free',
    settings JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT companies_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT companies_tax_id_not_empty CHECK (LENGTH(TRIM(tax_id)) > 0)
);

-- Create indexes for better query performance
CREATE INDEX idx_companies_tax_id ON companies(tax_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_is_active ON companies(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_plan_type ON companies(plan_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_deleted_at ON companies(deleted_at);

-- Add comments for documentation
COMMENT ON TABLE companies IS 'Organizations/enterprises that manage properties';
COMMENT ON COLUMN companies.id IS 'Primary key (UUID v4)';
COMMENT ON COLUMN companies.name IS 'Company name';
COMMENT ON COLUMN companies.tax_id IS 'Tax identification number (unique)';
COMMENT ON COLUMN companies.plan_type IS 'Subscription plan type';
COMMENT ON COLUMN companies.settings IS 'JSON configuration settings for the company';
COMMENT ON COLUMN companies.is_active IS 'Whether the company account is active';
COMMENT ON COLUMN companies.deleted_at IS 'Soft delete timestamp';

-- Create trigger for updated_at
CREATE TRIGGER update_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW
    EXECUTE FUNCTION functions.update_updated_at_column();
