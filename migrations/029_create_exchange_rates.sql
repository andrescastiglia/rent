-- =============================================================================
-- Migration: 029_create_exchange_rates
-- Description: Create table for storing exchange rates
-- =============================================================================

-- Create exchange_rates table
CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Currency pair
    from_currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    to_currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    
    -- Rate information
    rate DECIMAL(12, 6) NOT NULL,
    rate_date DATE NOT NULL,
    
    -- Source metadata
    source VARCHAR(50) NOT NULL,  -- BCRA, BCB, manual, etc.
    source_url VARCHAR(500),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT exchange_rates_unique UNIQUE (from_currency, to_currency, rate_date, source),
    CONSTRAINT exchange_rates_rate_check CHECK (rate > 0),
    CONSTRAINT exchange_rates_currencies_different CHECK (from_currency != to_currency)
);

-- Create indexes
CREATE INDEX idx_exchange_rates_currencies ON exchange_rates(from_currency, to_currency);
CREATE INDEX idx_exchange_rates_date ON exchange_rates(rate_date DESC);
CREATE INDEX idx_exchange_rates_lookup ON exchange_rates(from_currency, to_currency, rate_date DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_exchange_rates_updated_at
    BEFORE UPDATE ON exchange_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE exchange_rates IS 'Historical exchange rates for multi-currency support';
COMMENT ON COLUMN exchange_rates.from_currency IS 'Source currency code (e.g., USD)';
COMMENT ON COLUMN exchange_rates.to_currency IS 'Target currency code (e.g., ARS)';
COMMENT ON COLUMN exchange_rates.rate IS 'Exchange rate (how many to_currency per 1 from_currency)';
COMMENT ON COLUMN exchange_rates.rate_date IS 'Date this rate applies to';
COMMENT ON COLUMN exchange_rates.source IS 'Source of the exchange rate (BCRA, BCB, manual)';
