BEGIN;
CREATE TABLE IF NOT EXISTS settlement_generation_cancellations (
  company_id uuid NOT NULL REFERENCES companies(id),
  idempotency_key uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES owners(id),
  cancelled_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,idempotency_key)
);
CREATE OR REPLACE FUNCTION preserve_settlement_generation_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A cancelled generation request is immutable';
END; $$;
DROP TRIGGER IF EXISTS immutable_settlement_generation_cancellation ON settlement_generation_cancellations;
CREATE TRIGGER immutable_settlement_generation_cancellation BEFORE UPDATE ON settlement_generation_cancellations
  FOR EACH ROW EXECUTE FUNCTION preserve_settlement_generation_cancellation();
COMMIT;
