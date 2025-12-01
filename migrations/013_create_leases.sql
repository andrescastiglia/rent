-- =============================================================================
-- Migration: 013_create_leases
-- Description: Create leases table for rental contracts
-- =============================================================================

-- Create payment frequency ENUM
CREATE TYPE payment_frequency AS ENUM ('monthly', 'biweekly', 'weekly');

-- Create lease status ENUM
CREATE TYPE lease_status AS ENUM ('draft', 'active', 'expired', 'terminated', 'renewed');

-- Create leases table
CREATE TABLE leases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    tenant_id UUID NOT NULL REFERENCES tenants(user_id) ON DELETE RESTRICT,
    
    -- Contract dates
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- Financial terms
    rent_amount DECIMAL(10, 2) NOT NULL,
    deposit DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS',
    payment_frequency payment_frequency DEFAULT 'monthly',
    
    -- Contract details
    status lease_status DEFAULT 'draft',
    renewal_terms TEXT,
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    
    CONSTRAINT leases_dates_check CHECK (end_date > start_date),
    CONSTRAINT leases_rent_amount_check CHECK (rent_amount > 0),
    CONSTRAINT leases_deposit_check CHECK (deposit >= 0)
);

-- Create indexes
CREATE INDEX idx_leases_unit_id ON leases(unit_id);
CREATE INDEX idx_leases_tenant_id ON leases(tenant_id);
CREATE INDEX idx_leases_status ON leases(status);
CREATE INDEX idx_leases_start_date ON leases(start_date);
CREATE INDEX idx_leases_end_date ON leases(end_date);
CREATE INDEX idx_leases_deleted_at ON leases(deleted_at);

-- Create unique index to prevent multiple active leases per unit
CREATE UNIQUE INDEX idx_leases_unit_active ON leases(unit_id) 
    WHERE status = 'active' AND deleted_at IS NULL;

-- Create trigger for updated_at
CREATE TRIGGER update_leases_updated_at
    BEFORE UPDATE ON leases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE leases IS 'Rental contracts between tenants and units';
COMMENT ON COLUMN leases.status IS 'Current status of the lease contract';
COMMENT ON COLUMN leases.renewal_terms IS 'Terms and conditions for contract renewal';
COMMENT ON INDEX idx_leases_unit_active IS 'Ensures only one active lease per unit at a time';
