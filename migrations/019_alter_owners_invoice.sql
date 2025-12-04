-- =============================================================================
-- Migration: 019_alter_owners_invoice
-- Description: Add invoice configuration fields to owners table
-- =============================================================================

-- Add invoice fields to owners table
ALTER TABLE owners
    ADD COLUMN invoice_prefix VARCHAR(10),
    ADD COLUMN invoice_number INTEGER DEFAULT 0;

-- Add constraints
ALTER TABLE owners
    ADD CONSTRAINT owners_invoice_prefix_format 
        CHECK (invoice_prefix IS NULL OR LENGTH(TRIM(invoice_prefix)) > 0),
    ADD CONSTRAINT owners_invoice_number_check 
        CHECK (invoice_number >= 0);

-- Create unique index on invoice_prefix
CREATE UNIQUE INDEX idx_owners_invoice_prefix 
    ON owners(invoice_prefix) 
    WHERE invoice_prefix IS NOT NULL;

-- Add comments
COMMENT ON COLUMN owners.invoice_prefix IS 'Unique prefix for invoice numbering (e.g., ABC)';
COMMENT ON COLUMN owners.invoice_number IS 'Last used invoice number (can be set from AFIP facturador)';
