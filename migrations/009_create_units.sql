-- =============================================================================
-- Migration: 009_create_units
-- Description: Create units table for individual rental units within properties
-- =============================================================================

-- Create unit status ENUM
CREATE TYPE unit_status AS ENUM ('available', 'occupied', 'maintenance', 'reserved');

-- Create units table
CREATE TABLE units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    
    -- Unit identification
    unit_number VARCHAR(50) NOT NULL,
    floor INTEGER,
    
    -- Unit specifications
    bedrooms INTEGER DEFAULT 0,
    bathrooms INTEGER DEFAULT 0,
    area_sqm DECIMAL(10, 2) NOT NULL,
    
    -- Rental information
    monthly_rent DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'ARS',
    status unit_status DEFAULT 'available',
    
    -- Additional details
    description TEXT,
    has_parking BOOLEAN DEFAULT false,
    parking_spots INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    
    CONSTRAINT units_property_unit_unique UNIQUE(property_id, unit_number),
    CONSTRAINT units_bedrooms_check CHECK (bedrooms >= 0),
    CONSTRAINT units_bathrooms_check CHECK (bathrooms >= 0),
    CONSTRAINT units_area_check CHECK (area_sqm > 0),
    CONSTRAINT units_monthly_rent_check CHECK (monthly_rent IS NULL OR monthly_rent >= 0),
    CONSTRAINT units_parking_spots_check CHECK (parking_spots >= 0)
);

-- Create indexes
CREATE INDEX idx_units_property_id ON units(property_id);
CREATE INDEX idx_units_status ON units(status);
CREATE INDEX idx_units_deleted_at ON units(deleted_at);
CREATE INDEX idx_units_monthly_rent ON units(monthly_rent) WHERE deleted_at IS NULL;

-- Create trigger for updated_at
CREATE TRIGGER update_units_updated_at
    BEFORE UPDATE ON units
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE units IS 'Individual rental units within properties';
COMMENT ON COLUMN units.unit_number IS 'Unique identifier for the unit within the property (e.g., "101", "A-5")';
COMMENT ON COLUMN units.status IS 'Current availability status of the unit';
COMMENT ON COLUMN units.monthly_rent IS 'Base monthly rent amount (can be null if not yet determined)';
