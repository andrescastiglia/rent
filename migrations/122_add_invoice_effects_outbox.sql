BEGIN;
CREATE TABLE IF NOT EXISTS invoice_effects_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  invoice_id uuid NOT NULL UNIQUE REFERENCES invoices(id),
  snapshot jsonb NOT NULL,
  document_id uuid UNIQUE REFERENCES documents(id),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','completed','dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_invoice_effects_due ON invoice_effects_outbox(next_attempt_at,created_at) WHERE status='queued';
CREATE OR REPLACE FUNCTION preserve_invoice_effects() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
    OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.document_id IS NOT NULL AND NEW.document_id IS DISTINCT FROM OLD.document_id) THEN
    RAISE EXCEPTION 'Issued invoice source is immutable';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS immutable_invoice_effects ON invoice_effects_outbox;
CREATE TRIGGER immutable_invoice_effects BEFORE UPDATE ON invoice_effects_outbox FOR EACH ROW EXECUTE FUNCTION preserve_invoice_effects();
-- Payments and cancellation remain possible; changing the issued source requires a correction.
CREATE OR REPLACE FUNCTION preserve_issued_invoice_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM invoice_effects_outbox WHERE invoice_id=OLD.id) AND (
    NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.lease_id IS DISTINCT FROM OLD.lease_id
    OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.tenant_account_id IS DISTINCT FROM OLD.tenant_account_id
    OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR NEW.period_start IS DISTINCT FROM OLD.period_start
    OR NEW.period_end IS DISTINCT FROM OLD.period_end OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
    OR NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.late_fee_amount IS DISTINCT FROM OLD.late_fee_amount OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.notes IS DISTINCT FROM OLD.notes OR NEW.line_items IS DISTINCT FROM OLD.line_items OR NEW.status='draft') THEN
    RAISE EXCEPTION 'Issued invoice source requires a correction';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS immutable_issued_invoice_source ON invoices;
CREATE TRIGGER immutable_issued_invoice_source BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION preserve_issued_invoice_source();
COMMIT;
