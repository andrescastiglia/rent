BEGIN;
CREATE TABLE IF NOT EXISTS invoice_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  lease_id uuid NOT NULL REFERENCES leases(id),
  idempotency_key uuid NOT NULL,
  request jsonb NOT NULL CHECK (jsonb_typeof(request)='object'),
  invoice_id uuid NOT NULL UNIQUE REFERENCES invoices(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,idempotency_key)
);
-- Keep the key and invoice reference after cancellation or soft deletion.
-- A retry must never become an instruction to bill the next period.
CREATE OR REPLACE FUNCTION preserve_invoice_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'An invoice generation request and result are immutable';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS immutable_invoice_generation ON invoice_generations;
CREATE TRIGGER immutable_invoice_generation BEFORE UPDATE ON invoice_generations
  FOR EACH ROW EXECUTE FUNCTION preserve_invoice_generation();
COMMIT;
