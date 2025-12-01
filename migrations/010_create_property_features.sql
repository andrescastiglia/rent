-- =============================================================================
-- Migration: 010_create_property_features
-- Description: Create property_features table for amenities and characteristics
-- =============================================================================

-- Create property_features table
CREATE TABLE property_features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    
    -- Feature details
    feature_name VARCHAR(100) NOT NULL,
    feature_value VARCHAR(255),
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT property_features_unique UNIQUE(property_id, feature_name)
);

-- Create indexes
CREATE INDEX idx_property_features_property_id ON property_features(property_id);
CREATE INDEX idx_property_features_name ON property_features(feature_name);

-- Create trigger for updated_at
CREATE TRIGGER update_property_features_updated_at
    BEFORE UPDATE ON property_features
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE property_features IS 'Amenities and features of properties (e.g., pool, gym, security)';
COMMENT ON COLUMN property_features.feature_name IS 'Name of the feature (e.g., "pool", "gym", "security_24h")';
COMMENT ON COLUMN property_features.feature_value IS 'Optional value for the feature (e.g., "Olympic size", "2 elevators")';

-- Insert common features as reference (optional)
-- These can be used for autocomplete or validation
COMMENT ON TABLE property_features IS 'Common features: pool, gym, elevator, security_24h, parking, garden, playground, bbq_area, laundry, storage, balcony, terrace, air_conditioning, heating, internet, cable_tv, pet_friendly';
