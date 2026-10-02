BEGIN;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS late_fee_calculation jsonb;
CREATE OR REPLACE FUNCTION preserve_late_fee_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.late_fee_calculation IS NOT NULL AND OLD.late_fee_calculation IS DISTINCT FROM NEW.late_fee_calculation THEN
    RAISE EXCEPTION 'Late fee calculation evidence is immutable';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS immutable_late_fee_evidence ON invoices;
CREATE TRIGGER immutable_late_fee_evidence BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION preserve_late_fee_evidence();
COMMIT;
