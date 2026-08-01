-- Batch reconciliation job and persistent unmatched-movement alerts.

ALTER TYPE billing_job_type ADD VALUE IF NOT EXISTS 'reconcile_bank';

CREATE TABLE IF NOT EXISTS bank_reconciliation_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    movement_id UUID NOT NULL REFERENCES bank_movements(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'resolved')),
    reason TEXT NOT NULL,
    occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
    first_detected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_detected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_bank_reconciliation_alerts_movement UNIQUE (movement_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_alerts_open
    ON bank_reconciliation_alerts(company_id, last_detected_at DESC)
    WHERE status = 'open';

DROP TRIGGER IF EXISTS update_bank_reconciliation_alerts_updated_at
    ON bank_reconciliation_alerts;
CREATE TRIGGER update_bank_reconciliation_alerts_updated_at
    BEFORE UPDATE ON bank_reconciliation_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
