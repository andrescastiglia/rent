-- =============================================================================
-- Migration: 003_create_owners.sql
-- Description: Create owners table (property owners extension of users)
-- =============================================================================

-- Create owners table
CREATE TABLE owners (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    
    -- Tax and payment information
    tax_id VARCHAR(50) UNIQUE,
    bank_account VARCHAR(100),
    bank_name VARCHAR(100),
    preferred_payment_method VARCHAR(50),
    
    -- Additional information
    company_name VARCHAR(255), -- For corporate owners
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT owners_tax_id_format CHECK (tax_id IS NULL OR LENGTH(TRIM(tax_id)) > 0)
);

-- Create indexes
CREATE INDEX idx_owners_tax_id ON owners(tax_id) WHERE tax_id IS NOT NULL;
CREATE INDEX idx_owners_created_at ON owners(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE owners IS 'Property owners (extends users table)';
COMMENT ON COLUMN owners.user_id IS 'Foreign key to users table (also primary key)';
COMMENT ON COLUMN owners.tax_id IS 'Tax identification number for the owner';
COMMENT ON COLUMN owners.bank_account IS 'Bank account number for receiving payments';
COMMENT ON COLUMN owners.preferred_payment_method IS 'Preferred method for receiving rent payments';
COMMENT ON COLUMN owners.company_name IS 'Company name if owner is a legal entity';

-- Create trigger for updated_at
CREATE TRIGGER update_owners_updated_at
    BEFORE UPDATE ON owners
    FOR EACH ROW
    EXECUTE FUNCTION functions.update_updated_at_column();

-- Create function to validate owner user role
CREATE OR REPLACE FUNCTION validate_owner_user_role()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users 
        WHERE id = NEW.user_id 
        AND role = 'owner'
        AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'User must have role ''owner'' to be in owners table';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate role
CREATE TRIGGER validate_owner_role
    BEFORE INSERT OR UPDATE ON owners
    FOR EACH ROW
    EXECUTE FUNCTION validate_owner_user_role();
