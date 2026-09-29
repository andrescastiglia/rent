BEGIN;

CREATE TABLE IF NOT EXISTS sale_receipt_effects_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id),
    receipt_id uuid NOT NULL UNIQUE REFERENCES sale_receipts(id),
    status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'completed', 'dead_letter')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sale_receipt_effects_due
    ON sale_receipt_effects_outbox (next_attempt_at, created_at)
    WHERE status = 'queued';

-- Recover receipts whose original post-commit PDF generation failed.
INSERT INTO sale_receipt_effects_outbox (company_id, receipt_id)
SELECT a.company_id, r.id FROM sale_receipts r
JOIN sale_agreements a ON a.id = r.agreement_id
WHERE r.pdf_url IS NULL AND a.deleted_at IS NULL
ON CONFLICT (receipt_id) DO NOTHING;

COMMIT;
