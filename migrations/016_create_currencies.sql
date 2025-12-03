-- =============================================================================
-- Migration: 016_create_currencies
-- Description: Create currencies table and update units/leases to use FK
-- =============================================================================

-- Create currencies table
CREATE TABLE currencies (
    code VARCHAR(3) PRIMARY KEY,  -- ISO 4217 code (ARS, USD, BRL, etc.)
    symbol VARCHAR(5) NOT NULL,   -- Display symbol ($, US$, R$, etc.)
    decimal_places INTEGER DEFAULT 2,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial currencies
INSERT INTO currencies (code, symbol, decimal_places, is_active) VALUES
    ('ARS', '$', 2, true),
    ('BRL', 'R$', 2, true),
    ('USD', 'US$', 2, true);

-- Add trigger for updated_at on currencies
CREATE TRIGGER update_currencies_updated_at
    BEFORE UPDATE ON currencies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Rename currency column to currency_code in units table
ALTER TABLE units RENAME COLUMN currency TO currency_code;

-- Add FK constraint to units table
ALTER TABLE units
    ADD CONSTRAINT fk_units_currency 
    FOREIGN KEY (currency_code) REFERENCES currencies(code);

-- Rename currency column to currency_code in leases table
ALTER TABLE leases RENAME COLUMN currency TO currency_code;

-- Add FK constraint to leases table
ALTER TABLE leases
    ADD CONSTRAINT fk_leases_currency 
    FOREIGN KEY (currency_code) REFERENCES currencies(code);

-- Create index on currencies for performance
CREATE INDEX idx_currencies_is_active ON currencies(is_active) WHERE is_active = true;

-- Add comments
COMMENT ON TABLE currencies IS 'Supported currencies for rental amounts';
COMMENT ON COLUMN currencies.code IS 'ISO 4217 currency code';
COMMENT ON COLUMN currencies.symbol IS 'Currency symbol for display';
COMMENT ON COLUMN currencies.decimal_places IS 'Number of decimal places for formatting';
