-- Provider-neutral bank movement ingestion and reconciliation.

CREATE TABLE IF NOT EXISTS bank_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
    provider VARCHAR(50) NOT NULL,
    external_id VARCHAR(150) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('credit', 'debit')),
    amount DECIMAL(14, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'ARS',
    occurred_at TIMESTAMPTZ NOT NULL,
    description TEXT,
    counterparty VARCHAR(200),
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'reconciled', 'unmatched', 'ignored')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_bank_movements_provider_external
        UNIQUE (company_id, provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_movements_pending
    ON bank_movements(company_id, occurred_at)
    WHERE status IN ('pending', 'unmatched');

CREATE TABLE IF NOT EXISTS bank_reconciliations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    movement_id UUID NOT NULL REFERENCES bank_movements(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    match_strategy VARCHAR(30)
        CHECK (match_strategy IN ('virtual_alias', 'exact_amount_date', 'manual')),
    status VARCHAR(20) NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'matched', 'unmatched', 'failed')),
    reason TEXT,
    matched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_bank_reconciliations_movement UNIQUE (movement_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_company_status
    ON bank_reconciliations(company_id, status, created_at DESC);

DROP TRIGGER IF EXISTS update_bank_movements_updated_at ON bank_movements;
CREATE TRIGGER update_bank_movements_updated_at
    BEFORE UPDATE ON bank_movements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bank_reconciliations_updated_at ON bank_reconciliations;
CREATE TRIGGER update_bank_reconciliations_updated_at
    BEFORE UPDATE ON bank_reconciliations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

