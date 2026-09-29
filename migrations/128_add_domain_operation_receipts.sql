BEGIN;
CREATE TABLE IF NOT EXISTS domain_operation_receipts (
  company_id uuid NOT NULL REFERENCES companies(id),
  execution_key uuid NOT NULL,
  operation text NOT NULL CHECK (length(operation)>0),
  request jsonb NOT NULL CHECK (jsonb_typeof(request)='object'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,execution_key)
);
-- A receipt survives later changes or soft deletion of the domain entity.
CREATE OR REPLACE FUNCTION preserve_domain_operation_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'A domain operation receipt is immutable';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS immutable_domain_operation_receipt ON domain_operation_receipts;
CREATE TRIGGER immutable_domain_operation_receipt BEFORE UPDATE ON domain_operation_receipts
  FOR EACH ROW EXECUTE FUNCTION preserve_domain_operation_receipt();
COMMIT;
