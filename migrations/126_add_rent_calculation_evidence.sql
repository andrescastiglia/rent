BEGIN;
ALTER TABLE leases ADD COLUMN IF NOT EXISTS inflation_index_lag_months integer;
ALTER TABLE leases ADD COLUMN IF NOT EXISTS adjustment_anchor_date date;
ALTER TABLE leases DROP CONSTRAINT IF EXISTS leases_index_lag_check;
ALTER TABLE leases ADD CONSTRAINT leases_index_lag_check CHECK (inflation_index_lag_months BETWEEN 0 AND 12);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS rent_calculation jsonb;
CREATE OR REPLACE FUNCTION preserve_invoice_rent_calculation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.rent_calculation IS DISTINCT FROM NEW.rent_calculation THEN
    RAISE EXCEPTION 'Invoice rent calculation evidence is immutable';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS immutable_invoice_rent_calculation ON invoices;
CREATE TRIGGER immutable_invoice_rent_calculation BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION preserve_invoice_rent_calculation();
COMMIT;
