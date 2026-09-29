BEGIN;
-- Existing notes keep an unknown origin; no inference from mutable reason text.
ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS origin text CHECK (origin = 'late_fee_settlement'),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by_payment_id uuid REFERENCES payments(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_notes_active_late_fee
  ON credit_notes(company_id, invoice_id)
  WHERE origin='late_fee_settlement' AND status='issued' AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION protect_credit_note_cancellation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origin IS DISTINCT FROM OLD.origin THEN
    RAISE EXCEPTION 'Credit note origin is immutable';
  END IF;
  IF OLD.status='cancelled' AND (
    NEW.status IS DISTINCT FROM OLD.status OR
    NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at OR
    NEW.cancelled_by_payment_id IS DISTINCT FROM OLD.cancelled_by_payment_id
  ) THEN
    RAISE EXCEPTION 'Credit note cancellation is immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS credit_note_cancellation_immutable ON credit_notes;
CREATE TRIGGER credit_note_cancellation_immutable BEFORE UPDATE ON credit_notes
  FOR EACH ROW EXECUTE FUNCTION protect_credit_note_cancellation();
COMMIT;
