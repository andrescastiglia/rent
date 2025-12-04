-- =============================================================================
-- Migration: 022_create_commission_invoices
-- Description: Create commission invoices table (company to owner)
-- =============================================================================

-- Create commission invoice status ENUM
CREATE TYPE commission_invoice_status AS ENUM ('draft', 'issued', 'paid', 'cancelled');

-- Create commission_invoices table
CREATE TABLE commission_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    owner_id UUID NOT NULL REFERENCES owners(user_id) ON DELETE RESTRICT,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    
    -- Invoice identification
    invoice_number VARCHAR(50) NOT NULL,
    
    -- Commission calculation
    commission_rate DECIMAL(5, 2) NOT NULL,
    base_amount DECIMAL(12, 2) NOT NULL,
    subtotal DECIMAL(12, 2) NOT NULL,
    tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 21.00,
    tax_amount DECIMAL(12, 2) NOT NULL,
    total DECIMAL(12, 2) NOT NULL,
    currency_code VARCHAR(3) NOT NULL DEFAULT 'ARS' REFERENCES currencies(code),
    
    -- Status and document
    status commission_invoice_status NOT NULL DEFAULT 'draft',
    pdf_url VARCHAR(500),
    issued_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT commission_invoices_rates_check 
        CHECK (commission_rate >= 0 AND commission_rate <= 100 AND tax_rate >= 0),
    CONSTRAINT commission_invoices_amounts_check 
        CHECK (base_amount >= 0 AND subtotal >= 0 AND tax_amount >= 0 AND total >= 0)
);

-- Create unique constraint on invoice_number per company
CREATE UNIQUE INDEX idx_commission_invoices_number_company 
    ON commission_invoices(company_id, invoice_number) 
    WHERE deleted_at IS NULL;

-- Create indexes
CREATE INDEX idx_commission_invoices_company_id ON commission_invoices(company_id);
CREATE INDEX idx_commission_invoices_owner_id ON commission_invoices(owner_id);
CREATE INDEX idx_commission_invoices_invoice_id ON commission_invoices(invoice_id);
CREATE INDEX idx_commission_invoices_status ON commission_invoices(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_commission_invoices_deleted_at ON commission_invoices(deleted_at);

-- Create trigger for updated_at
CREATE TRIGGER update_commission_invoices_updated_at
    BEFORE UPDATE ON commission_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE commission_invoices IS 'Invoices issued by the company to property owners for commission';
COMMENT ON COLUMN commission_invoices.invoice_id IS 'Related tenant invoice (if applicable)';
COMMENT ON COLUMN commission_invoices.commission_rate IS 'Commission percentage applied';
COMMENT ON COLUMN commission_invoices.base_amount IS 'Base amount for commission calculation';
COMMENT ON COLUMN commission_invoices.tax_rate IS 'Tax rate (IVA) applied to commission';
