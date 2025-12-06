-- =============================================================================
-- Migration: 027_alter_invoices_arca
-- Description: Add ARCA, multi-currency, and withholding fields to invoices
-- =============================================================================

-- Create ARCA invoice type ENUM
CREATE TYPE arca_tipo_comprobante AS ENUM (
    'factura_a',      -- 001 - Factura A
    'factura_b',      -- 006 - Factura B
    'factura_c',      -- 011 - Factura C
    'recibo_a',       -- 004 - Recibo A
    'recibo_b',       -- 009 - Recibo B
    'recibo_c',       -- 015 - Recibo C
    'nota_credito_a', -- 003 - Nota de Crédito A
    'nota_credito_b', -- 008 - Nota de Crédito B
    'nota_credito_c'  -- 013 - Nota de Crédito C
);

-- Add ARCA, multi-currency, and withholding fields to invoices table
ALTER TABLE invoices
    -- ARCA Electronic Invoicing
    ADD COLUMN arca_cae VARCHAR(14),
    ADD COLUMN arca_cae_expiration DATE,
    ADD COLUMN arca_tipo_comprobante arca_tipo_comprobante,
    ADD COLUMN arca_punto_venta INTEGER,
    ADD COLUMN arca_numero_comprobante INTEGER,
    ADD COLUMN arca_qr_data TEXT,
    ADD COLUMN arca_error_log TEXT,
    
    -- Multi-Currency Support
    ADD COLUMN original_amount DECIMAL(12, 2),
    ADD COLUMN original_currency VARCHAR(3),
    ADD COLUMN exchange_rate_used DECIMAL(12, 6),
    ADD COLUMN exchange_rate_date DATE,
    
    -- Withholdings
    ADD COLUMN withholding_iibb DECIMAL(12, 2) DEFAULT 0,
    ADD COLUMN withholding_iva DECIMAL(12, 2) DEFAULT 0,
    ADD COLUMN withholding_ganancias DECIMAL(12, 2) DEFAULT 0,
    ADD COLUMN withholdings_total DECIMAL(12, 2) DEFAULT 0,
    
    -- Adjustment Tracking
    ADD COLUMN adjustment_applied DECIMAL(12, 2) DEFAULT 0,
    ADD COLUMN adjustment_index_type VARCHAR(10),
    ADD COLUMN adjustment_index_value DECIMAL(8, 4);

-- Add constraints
ALTER TABLE invoices
    ADD CONSTRAINT invoices_arca_punto_venta_check 
        CHECK (arca_punto_venta IS NULL OR arca_punto_venta > 0),
    ADD CONSTRAINT invoices_exchange_rate_check 
        CHECK (exchange_rate_used IS NULL OR exchange_rate_used > 0),
    ADD CONSTRAINT invoices_withholdings_check 
        CHECK (
            withholding_iibb >= 0 AND 
            withholding_iva >= 0 AND 
            withholding_ganancias >= 0 AND
            withholdings_total >= 0
        );

-- Add comments
COMMENT ON COLUMN invoices.arca_cae IS 'CAE (Código de Autorización Electrónico) from ARCA/AFIP';
COMMENT ON COLUMN invoices.arca_cae_expiration IS 'CAE expiration date';
COMMENT ON COLUMN invoices.arca_tipo_comprobante IS 'ARCA invoice type (Factura A/B/C, etc.)';
COMMENT ON COLUMN invoices.arca_punto_venta IS 'Point of sale used for this invoice';
COMMENT ON COLUMN invoices.arca_numero_comprobante IS 'ARCA invoice number';
COMMENT ON COLUMN invoices.arca_qr_data IS 'JSON data for ARCA QR code';
COMMENT ON COLUMN invoices.original_amount IS 'Amount in original contract currency before conversion';
COMMENT ON COLUMN invoices.original_currency IS 'Original contract currency code';
COMMENT ON COLUMN invoices.exchange_rate_used IS 'Exchange rate used for currency conversion';
COMMENT ON COLUMN invoices.withholding_iibb IS 'IIBB (Ingresos Brutos) withholding amount';
COMMENT ON COLUMN invoices.withholding_iva IS 'IVA withholding amount';
COMMENT ON COLUMN invoices.withholding_ganancias IS 'Ganancias withholding amount';
COMMENT ON COLUMN invoices.withholdings_total IS 'Total withholdings amount';
COMMENT ON COLUMN invoices.adjustment_applied IS 'Inflation adjustment amount applied';
COMMENT ON COLUMN invoices.adjustment_index_type IS 'Type of index used for adjustment (ICL, IGP-M)';
COMMENT ON COLUMN invoices.adjustment_index_value IS 'Index value at time of adjustment';

-- Create indexes for ARCA fields
CREATE INDEX idx_invoices_arca_cae ON invoices(arca_cae) WHERE arca_cae IS NOT NULL;
CREATE INDEX idx_invoices_original_currency ON invoices(original_currency) WHERE original_currency IS NOT NULL;
