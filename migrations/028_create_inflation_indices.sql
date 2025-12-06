-- =============================================================================
-- Migration: 028_create_inflation_indices
-- Description: Create table for storing inflation indices (ICL, IGP-M)
-- =============================================================================

-- Create index type ENUM
CREATE TYPE inflation_index_type AS ENUM ('icl', 'igpm');

-- Create inflation_indices table
CREATE TABLE inflation_indices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Index identification
    index_type inflation_index_type NOT NULL,
    period DATE NOT NULL,  -- First day of the month this index applies to
    
    -- Values
    value DECIMAL(12, 6) NOT NULL,
    variation_monthly DECIMAL(8, 4),  -- Percentage variation from previous month
    variation_yearly DECIMAL(8, 4),   -- Percentage variation from same month previous year
    
    -- Source metadata
    source_url VARCHAR(500),
    source_name VARCHAR(100),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique index per period
    CONSTRAINT inflation_indices_unique UNIQUE (index_type, period),
    CONSTRAINT inflation_indices_value_check CHECK (value >= 0)
);

-- Create indexes
CREATE INDEX idx_inflation_indices_type ON inflation_indices(index_type);
CREATE INDEX idx_inflation_indices_period ON inflation_indices(period DESC);
CREATE INDEX idx_inflation_indices_type_period ON inflation_indices(index_type, period DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_inflation_indices_updated_at
    BEFORE UPDATE ON inflation_indices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE inflation_indices IS 'Historical inflation indices for rent adjustments';
COMMENT ON COLUMN inflation_indices.index_type IS 'Type of index: ICL (Argentina) or IGP-M (Brazil)';
COMMENT ON COLUMN inflation_indices.period IS 'Month/year this index applies to (first day of month)';
COMMENT ON COLUMN inflation_indices.value IS 'Index value for the period';
COMMENT ON COLUMN inflation_indices.variation_monthly IS 'Percentage change from previous month';
COMMENT ON COLUMN inflation_indices.variation_yearly IS 'Percentage change from same month previous year';
COMMENT ON COLUMN inflation_indices.source_url IS 'URL where the index was obtained';
COMMENT ON COLUMN inflation_indices.fetched_at IS 'Timestamp when the index was fetched from source';
