ALTER TYPE settlement_status ADD VALUE IF NOT EXISTS 'cancelled';
BEGIN;
CREATE TABLE IF NOT EXISTS settlement_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  settlement_id uuid NOT NULL UNIQUE REFERENCES settlements(id),
  owner_id uuid NOT NULL REFERENCES owners(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  idempotency_key uuid NOT NULL,
  request jsonb NOT NULL CHECK (jsonb_typeof(request)='object'),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','voided')),
  voided_by uuid REFERENCES users(id),
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,idempotency_key),
  UNIQUE(id,company_id),
  CHECK ((state='active' AND voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR (state='voided' AND voided_by IS NOT NULL AND voided_at IS NOT NULL AND length(void_reason)>=10))
);
CREATE TABLE IF NOT EXISTS settlement_generation_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  generation_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(generation_id,company_id) REFERENCES settlement_generations(id,company_id),
  UNIQUE(generation_id,invoice_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_reserved_invoice
  ON settlement_generation_sources(invoice_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_settlement_generation_company ON settlement_generations(company_id,owner_id);
-- Supplementary collections in a period are deduplicated by their source invoices.
-- Historical settlements without sources require explicit reconciliation, not backfill.
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS uq_settlement_owner_period;
CREATE INDEX IF NOT EXISTS idx_settlement_owner_period ON settlements(owner_id,period);

CREATE OR REPLACE FUNCTION preserve_settlement_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.company_id,NEW.settlement_id,NEW.owner_id,NEW.requested_by,NEW.idempotency_key,NEW.request,NEW.snapshot,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.company_id,OLD.settlement_id,OLD.owner_id,OLD.requested_by,OLD.idempotency_key,OLD.request,OLD.snapshot,OLD.created_at)
    OR (OLD.state='voided' AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'A settlement generation and its final audit are immutable';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS immutable_settlement_generation ON settlement_generations;
CREATE TRIGGER immutable_settlement_generation BEFORE UPDATE ON settlement_generations
  FOR EACH ROW EXECUTE FUNCTION preserve_settlement_generation();
CREATE OR REPLACE FUNCTION preserve_settlement_generation_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.company_id,NEW.generation_id,NEW.invoice_id,NEW.snapshot,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.company_id,OLD.generation_id,OLD.invoice_id,OLD.snapshot,OLD.created_at)
    OR (OLD.released_at IS NOT NULL AND NEW.released_at IS DISTINCT FROM OLD.released_at) THEN
    RAISE EXCEPTION 'A settlement source and its release are immutable';
  END IF;
  IF NEW.released_at IS DISTINCT FROM OLD.released_at AND NOT EXISTS(
    SELECT 1 FROM settlement_generations WHERE id=OLD.generation_id AND state='voided'
  ) THEN
    RAISE EXCEPTION 'Void the generation before releasing its sources';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS immutable_settlement_generation_source ON settlement_generation_sources;
CREATE TRIGGER immutable_settlement_generation_source BEFORE UPDATE ON settlement_generation_sources
  FOR EACH ROW EXECUTE FUNCTION preserve_settlement_generation_source();
COMMIT;
