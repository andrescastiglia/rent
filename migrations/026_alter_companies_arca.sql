-- =============================================================================
-- Migration: 026_alter_companies_arca
-- Description: Add ARCA (electronic invoicing) and withholding agent fields
-- =============================================================================

-- Add ARCA and withholding fields to companies table
ALTER TABLE companies
    -- ARCA Electronic Invoicing (Argentina)
    ADD COLUMN arca_cuit VARCHAR(13),
    ADD COLUMN arca_certificate_path VARCHAR(500),
    ADD COLUMN arca_private_key_path VARCHAR(500),
    ADD COLUMN arca_punto_venta INTEGER,
    ADD COLUMN arca_last_invoice_number INTEGER DEFAULT 0,
    ADD COLUMN arca_environment VARCHAR(20) DEFAULT 'sandbox',
    
    -- Withholding Agent Configuration
    ADD COLUMN is_withholding_agent BOOLEAN DEFAULT FALSE,
    ADD COLUMN withholding_iibb_rate DECIMAL(5, 2),
    ADD COLUMN withholding_iibb_jurisdiction VARCHAR(50),
    ADD COLUMN withholding_iva_rate DECIMAL(5, 2),
    ADD COLUMN withholding_ganancias_rate DECIMAL(5, 2),
    ADD COLUMN withholding_ganancias_min_amount DECIMAL(12, 2);

-- Add constraints
ALTER TABLE companies
    ADD CONSTRAINT companies_arca_punto_venta_check 
        CHECK (arca_punto_venta IS NULL OR arca_punto_venta > 0),
    ADD CONSTRAINT companies_arca_environment_check 
        CHECK (arca_environment IN ('sandbox', 'production')),
    ADD CONSTRAINT companies_withholding_iibb_rate_check 
        CHECK (withholding_iibb_rate IS NULL OR (withholding_iibb_rate >= 0 AND withholding_iibb_rate <= 100)),
    ADD CONSTRAINT companies_withholding_iva_rate_check 
        CHECK (withholding_iva_rate IS NULL OR (withholding_iva_rate >= 0 AND withholding_iva_rate <= 100)),
    ADD CONSTRAINT companies_withholding_ganancias_rate_check 
        CHECK (withholding_ganancias_rate IS NULL OR (withholding_ganancias_rate >= 0 AND withholding_ganancias_rate <= 100));

-- Add comments
COMMENT ON COLUMN companies.arca_cuit IS 'CUIT number for ARCA/AFIP electronic invoicing';
COMMENT ON COLUMN companies.arca_certificate_path IS 'Path to X.509 certificate for ARCA authentication';
COMMENT ON COLUMN companies.arca_private_key_path IS 'Path to private key for ARCA authentication';
COMMENT ON COLUMN companies.arca_punto_venta IS 'Point of sale number for ARCA invoicing';
COMMENT ON COLUMN companies.arca_last_invoice_number IS 'Last invoice number issued through ARCA';
COMMENT ON COLUMN companies.arca_environment IS 'ARCA environment: sandbox for testing, production for live';
COMMENT ON COLUMN companies.is_withholding_agent IS 'Whether company acts as withholding agent';
COMMENT ON COLUMN companies.withholding_iibb_rate IS 'IIBB (Ingresos Brutos) withholding rate percentage';
COMMENT ON COLUMN companies.withholding_iibb_jurisdiction IS 'IIBB jurisdiction code';
COMMENT ON COLUMN companies.withholding_iva_rate IS 'IVA withholding rate percentage';
COMMENT ON COLUMN companies.withholding_ganancias_rate IS 'Ganancias withholding rate percentage';
COMMENT ON COLUMN companies.withholding_ganancias_min_amount IS 'Minimum amount for Ganancias withholding';

-- Create index for withholding agents
CREATE INDEX idx_companies_withholding_agent 
    ON companies(is_withholding_agent) 
    WHERE deleted_at IS NULL AND is_withholding_agent = TRUE;
