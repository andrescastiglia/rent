-- =============================================================================
-- Migration: 008_create_properties
-- Description: Create properties table for managing real estate properties
-- =============================================================================

-- Create property type ENUM
CREATE TYPE property_type AS ENUM ('residential', 'commercial', 'vacation', 'mixed');

-- Create property status ENUM
CREATE TYPE property_status AS ENUM ('active', 'inactive', 'maintenance');

-- Create properties table
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    owner_id UUID NOT NULL REFERENCES owners(user_id) ON DELETE RESTRICT,
    
    -- Address information
    address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    zip_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) DEFAULT 'Argentina',
    
    -- Geographic location (latitude/longitude)
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Property details
    type property_type NOT NULL,
    status property_status DEFAULT 'active',
    description TEXT,
    year_built INTEGER,
    total_area_sqm DECIMAL(10, 2),
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    
    CONSTRAINT properties_year_built_check CHECK (year_built >= 1800 AND year_built <= EXTRACT(YEAR FROM CURRENT_DATE) + 5)
);

-- Create indexes
CREATE INDEX idx_properties_company_id ON properties(company_id);
CREATE INDEX idx_properties_owner_id ON properties(owner_id);
CREATE INDEX idx_properties_type ON properties(type);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_city ON properties(city);
CREATE INDEX idx_properties_deleted_at ON properties(deleted_at);
CREATE INDEX idx_properties_latitude ON properties(latitude);
CREATE INDEX idx_properties_longitude ON properties(longitude);

-- Create trigger for updated_at
CREATE TRIGGER update_properties_updated_at
    BEFORE UPDATE ON properties
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE properties IS 'Real estate properties managed by the platform';
COMMENT ON COLUMN properties.latitude IS 'Geographic latitude coordinate';
COMMENT ON COLUMN properties.longitude IS 'Geographic longitude coordinate';
COMMENT ON COLUMN properties.type IS 'Type of property: residential, commercial, vacation, or mixed use';
COMMENT ON COLUMN properties.status IS 'Current status of the property';
