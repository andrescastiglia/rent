-- =============================================================================
-- Migration: 014_create_lease_amendments
-- Description: Create lease_amendments table for contract modification history
-- =============================================================================

-- Create amendment change type ENUM
CREATE TYPE amendment_change_type AS ENUM ('rent_increase', 'rent_decrease', 'extension', 'termination', 'other');

-- Create amendment status ENUM
CREATE TYPE amendment_status AS ENUM ('pending', 'approved', 'rejected');

-- Create lease_amendments table
CREATE TABLE lease_amendments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    
    -- Amendment details
    effective_date DATE NOT NULL,
    change_type amendment_change_type NOT NULL,
    description TEXT,
    
    -- Change tracking (JSONB for flexibility)
    old_values JSONB,
    new_values JSONB,
    
    -- Approval workflow
    status amendment_status DEFAULT 'pending',
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT lease_amendments_effective_date_check CHECK (effective_date >= CURRENT_DATE)
);

-- Create indexes
CREATE INDEX idx_lease_amendments_lease_id ON lease_amendments(lease_id);
CREATE INDEX idx_lease_amendments_status ON lease_amendments(status);
CREATE INDEX idx_lease_amendments_effective_date ON lease_amendments(effective_date);

-- Create trigger for updated_at
CREATE TRIGGER update_lease_amendments_updated_at
    BEFORE UPDATE ON lease_amendments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE lease_amendments IS 'History of modifications to lease contracts';
COMMENT ON COLUMN lease_amendments.old_values IS 'Previous values before amendment (JSONB)';
COMMENT ON COLUMN lease_amendments.new_values IS 'New values after amendment (JSONB)';
COMMENT ON COLUMN lease_amendments.change_type IS 'Type of change: rent increase/decrease, extension, termination, etc.';
