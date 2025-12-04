-- =============================================================================
-- Migration: 023_create_payments
-- Description: Create payments table for tenant payments
-- =============================================================================

-- Create payment method ENUM
CREATE TYPE payment_method AS ENUM ('cash', 'transfer', 'check', 'debit', 'credit', 'other');

-- Create payment status ENUM
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'cancelled', 'reversed');

-- Create payments table
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_account_id UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE RESTRICT,
    
    -- Payment details
    amount DECIMAL(12, 2) NOT NULL,
    currency_code VARCHAR(3) NOT NULL DEFAULT 'ARS' REFERENCES currencies(code),
    payment_date DATE NOT NULL,
    
    -- Method and reference
    method payment_method NOT NULL,
    reference VARCHAR(255),
    
    -- Status
    status payment_status NOT NULL DEFAULT 'pending',
    
    -- Metadata
    notes TEXT,
    received_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT payments_amount_check CHECK (amount > 0)
);

-- Create indexes
CREATE INDEX idx_payments_tenant_account_id ON payments(tenant_account_id);
CREATE INDEX idx_payments_payment_date ON payments(payment_date DESC);
CREATE INDEX idx_payments_status ON payments(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_payments_method ON payments(method) WHERE deleted_at IS NULL;
CREATE INDEX idx_payments_deleted_at ON payments(deleted_at);

-- Create trigger for updated_at
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE payments IS 'Payments made by tenants';
COMMENT ON COLUMN payments.tenant_account_id IS 'Tenant account receiving the payment';
COMMENT ON COLUMN payments.reference IS 'External reference (bank transfer number, check number, etc)';
COMMENT ON COLUMN payments.received_by IS 'User who registered the payment';
