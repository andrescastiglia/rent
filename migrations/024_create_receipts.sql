-- =============================================================================
-- Migration: 024_create_receipts
-- Description: Create receipts table for payment receipts
-- =============================================================================

-- Create receipts table
CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    
    -- Receipt identification
    receipt_number VARCHAR(50) NOT NULL,
    
    -- Amount (same as payment, for reference)
    amount DECIMAL(12, 2) NOT NULL,
    currency_code VARCHAR(3) NOT NULL DEFAULT 'ARS' REFERENCES currencies(code),
    
    -- Document
    pdf_url VARCHAR(500),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT receipts_amount_check CHECK (amount > 0),
    CONSTRAINT receipts_payment_unique UNIQUE (payment_id)
);

-- Create unique constraint on receipt_number
CREATE UNIQUE INDEX idx_receipts_number ON receipts(receipt_number);

-- Create indexes
CREATE INDEX idx_receipts_payment_id ON receipts(payment_id);
CREATE INDEX idx_receipts_issued_at ON receipts(issued_at DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_receipts_updated_at
    BEFORE UPDATE ON receipts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE receipts IS 'Payment receipts issued to tenants';
COMMENT ON COLUMN receipts.receipt_number IS 'Sequential receipt number';
COMMENT ON COLUMN receipts.pdf_url IS 'S3 key for the PDF document';
