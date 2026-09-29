BEGIN;
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice_state
  ON payment_allocations(company_id,invoice_id,created_at DESC,id DESC)
  WHERE previous_invoice_status IN ('pending','sent','overdue');
COMMIT;
