BEGIN;
CREATE TABLE IF NOT EXISTS sale_receipt_number_counters (
  agreement_id uuid PRIMARY KEY REFERENCES sale_agreements(id) ON DELETE CASCADE,
  last_number bigint NOT NULL CHECK(last_number>=0)
);
INSERT INTO sale_receipt_number_counters(agreement_id,last_number)
  SELECT agreement_id, COALESCE(MAX(substring(receipt_number FROM '-([0-9]+)$')::numeric),0)
  FROM sale_receipts GROUP BY agreement_id
  ON CONFLICT(agreement_id) DO NOTHING;
ALTER TABLE sale_receipts ADD COLUMN IF NOT EXISTS financial_snapshot jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS sale_receipt_new_numbers_idx
  ON sale_receipts(agreement_id,receipt_number) WHERE financial_snapshot IS NOT NULL;
CREATE OR REPLACE FUNCTION protect_sale_receipt_financials() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.agreement_id IS DISTINCT FROM OLD.agreement_id
    OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
    OR NEW.financial_snapshot IS DISTINCT FROM OLD.financial_snapshot
    OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
    OR NEW.balance_after IS DISTINCT FROM OLD.balance_after
    OR NEW.overdue_amount IS DISTINCT FROM OLD.overdue_amount
    OR NEW.copy_count IS DISTINCT FROM OLD.copy_count THEN
    RAISE EXCEPTION 'Sale receipt financial evidence cannot be overwritten';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sale_receipt_financials_no_update ON sale_receipts;
CREATE TRIGGER sale_receipt_financials_no_update BEFORE UPDATE ON sale_receipts
FOR EACH ROW EXECUTE FUNCTION protect_sale_receipt_financials();
COMMIT;
