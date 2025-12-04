-- =============================================================================
-- Migration: 021_create_invoices
-- Description: Create invoices table (owner to tenant)
-- =============================================================================

-- Create invoice status ENUM
CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'paid', 'partially_paid', 'cancelled', 'overdue');

-- Create invoices table
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
    owner_id UUID NOT NULL REFERENCES owners(user_id) ON DELETE RESTRICT,
    tenant_account_id UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE RESTRICT,
    
    -- Invoice identification
    invoice_number VARCHAR(50) NOT NULL,
    
    -- Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Amounts
    subtotal DECIMAL(12, 2) NOT NULL,
    late_fee DECIMAL(12, 2) NOT NULL DEFAULT 0,
    adjustments DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total DECIMAL(12, 2) NOT NULL,
    currency_code VARCHAR(3) NOT NULL DEFAULT 'ARS' REFERENCES currencies(code),
    
    -- Payment tracking
    amount_paid DECIMAL(12, 2) NOT NULL DEFAULT 0,
    due_date DATE NOT NULL,
    
    -- Status and document
    status invoice_status NOT NULL DEFAULT 'draft',
    pdf_url VARCHAR(500),
    issued_at TIMESTAMPTZ,
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT invoices_period_check CHECK (period_end >= period_start),
    CONSTRAINT invoices_amounts_check CHECK (subtotal >= 0 AND late_fee >= 0 AND total >= 0),
    CONSTRAINT invoices_amount_paid_check CHECK (amount_paid >= 0 AND amount_paid <= total)
);

-- Create unique constraint on invoice_number per owner
CREATE UNIQUE INDEX idx_invoices_number_owner 
    ON invoices(owner_id, invoice_number) 
    WHERE deleted_at IS NULL;

-- Create indexes
CREATE INDEX idx_invoices_lease_id ON invoices(lease_id);
CREATE INDEX idx_invoices_owner_id ON invoices(owner_id);
CREATE INDEX idx_invoices_tenant_account_id ON invoices(tenant_account_id);
CREATE INDEX idx_invoices_status ON invoices(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_due_date ON invoices(due_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_issued_at ON invoices(issued_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_deleted_at ON invoices(deleted_at);

-- Create trigger for updated_at
CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE invoices IS 'Invoices issued by property owners to tenants';
COMMENT ON COLUMN invoices.invoice_number IS 'Invoice number (unique per owner, can be from AFIP)';
COMMENT ON COLUMN invoices.owner_id IS 'Owner who issues the invoice';
COMMENT ON COLUMN invoices.late_fee IS 'Late fee amount applied';
COMMENT ON COLUMN invoices.amount_paid IS 'Total amount paid towards this invoice';
COMMENT ON COLUMN invoices.pdf_url IS 'S3 key for the PDF document';
