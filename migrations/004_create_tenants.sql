-- =============================================================================
-- Migration: 004_create_tenants.sql
-- Description: Create tenants table (renters/inquilinos extension of users)
-- =============================================================================

-- Create ENUM for employment status
CREATE TYPE employment_status AS ENUM ('employed', 'self_employed', 'unemployed', 'retired', 'student');

-- Create tenants table
CREATE TABLE tenants (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    
    -- Identification
    dni VARCHAR(50) NOT NULL UNIQUE,
    
    -- Emergency contact
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_relationship VARCHAR(100),
    
    -- Employment information
    employment_status employment_status,
    employer_name VARCHAR(255),
    employer_phone VARCHAR(20),
    monthly_income DECIMAL(12, 2),
    
    -- References
    reference_name VARCHAR(255),
    reference_phone VARCHAR(20),
    reference_relationship VARCHAR(100),
    
    -- Additional information
    occupation VARCHAR(100),
    number_of_occupants INT,
    has_pets BOOLEAN DEFAULT false,
    pet_details TEXT,
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT tenants_dni_not_empty CHECK (LENGTH(TRIM(dni)) > 0),
    CONSTRAINT tenants_monthly_income_positive CHECK (monthly_income IS NULL OR monthly_income >= 0),
    CONSTRAINT tenants_occupants_positive CHECK (number_of_occupants IS NULL OR number_of_occupants > 0)
);

-- Create indexes
CREATE INDEX idx_tenants_dni ON tenants(dni);
CREATE INDEX idx_tenants_employment_status ON tenants(employment_status);
CREATE INDEX idx_tenants_created_at ON tenants(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE tenants IS 'Tenants/renters (extends users table)';
COMMENT ON COLUMN tenants.user_id IS 'Foreign key to users table (also primary key)';
COMMENT ON COLUMN tenants.dni IS 'National ID number (DNI, cédula, passport)';
COMMENT ON COLUMN tenants.emergency_contact_name IS 'Name of emergency contact person';
COMMENT ON COLUMN tenants.monthly_income IS 'Monthly income for rent affordability assessment';
COMMENT ON COLUMN tenants.has_pets IS 'Whether the tenant has pets';
COMMENT ON COLUMN tenants.number_of_occupants IS 'Number of people who will occupy the property';

-- Create trigger for updated_at
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION functions.update_updated_at_column();

-- Create function to validate tenant user role
CREATE OR REPLACE FUNCTION validate_tenant_user_role()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users 
        WHERE id = NEW.user_id 
        AND role = 'tenant'
        AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'User must have role ''tenant'' to be in tenants table';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate role
CREATE TRIGGER validate_tenant_role
    BEFORE INSERT OR UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION validate_tenant_user_role();
