BEGIN;

CREATE TABLE IF NOT EXISTS payment_effects_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id),
    payment_id uuid NOT NULL UNIQUE REFERENCES payments(id),
    status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'completed', 'dead_letter')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payment_effects_due
    ON payment_effects_outbox (next_attempt_at, created_at)
    WHERE status = 'queued';

-- Recover incomplete legacy rendering without replaying already generated PDFs.
INSERT INTO payment_effects_outbox (company_id, payment_id)
SELECT p.company_id, p.id FROM payments p
WHERE p.status = 'completed' AND p.deleted_at IS NULL
  AND (EXISTS (SELECT 1 FROM receipts r
               WHERE r.payment_id = p.id AND r.pdf_url IS NULL
                 AND r.cancelled_at IS NULL)
       OR EXISTS (SELECT 1 FROM credit_notes cn
                  WHERE cn.payment_id = p.id AND cn.pdf_url IS NULL
                    AND cn.status = 'issued' AND cn.deleted_at IS NULL))
ON CONFLICT (payment_id) DO NOTHING;

COMMIT;
