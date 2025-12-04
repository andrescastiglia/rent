-- =============================================================================
-- Migration: 020_create_tenant_accounts
-- Description: Create tenant accounts and movements tables for balance tracking
-- =============================================================================

-- Create movement type ENUM
CREATE TYPE movement_type AS ENUM ('invoice', 'payment', 'late_fee', 'adjustment', 'credit');

-- Create tenant_accounts table
CREATE TABLE tenant_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
    balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
    last_calculated_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Only one account per lease
    CONSTRAINT tenant_accounts_lease_unique UNIQUE (lease_id)
);

-- Create tenant_account_movements table
CREATE TABLE tenant_account_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
    movement_type movement_type NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    balance_after DECIMAL(12, 2) NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    description TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_tenant_accounts_lease_id ON tenant_accounts(lease_id);
CREATE INDEX idx_tenant_account_movements_account_id ON tenant_account_movements(account_id);
CREATE INDEX idx_tenant_account_movements_reference ON tenant_account_movements(reference_type, reference_id);
CREATE INDEX idx_tenant_account_movements_created_at ON tenant_account_movements(created_at DESC);

-- Create trigger for updated_at on tenant_accounts
CREATE TRIGGER update_tenant_accounts_updated_at
    BEFORE UPDATE ON tenant_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE tenant_accounts IS 'Current account for each lease to track tenant balance';
COMMENT ON COLUMN tenant_accounts.balance IS 'Current balance: positive = debt, negative = credit';
COMMENT ON TABLE tenant_account_movements IS 'Transaction history for tenant accounts';
COMMENT ON COLUMN tenant_account_movements.balance_after IS 'Account balance after this movement';
COMMENT ON COLUMN tenant_account_movements.reference_type IS 'Type of referenced entity (invoice, payment, etc)';
COMMENT ON COLUMN tenant_account_movements.reference_id IS 'ID of the referenced entity';
