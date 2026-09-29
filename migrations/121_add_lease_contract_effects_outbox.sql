BEGIN;
-- Refuse legacy duplicates; never choose or delete a contract implicitly.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_rental_property
  ON leases(company_id,property_id)
  WHERE status='active' AND contract_type='rental' AND deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS lease_contract_effects_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  lease_id uuid NOT NULL UNIQUE REFERENCES leases(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  snapshot jsonb NOT NULL,
  document_id uuid UNIQUE REFERENCES documents(id),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','completed','dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_lease_contract_effects_due ON lease_contract_effects_outbox(next_attempt_at,created_at) WHERE status='queued';
CREATE OR REPLACE FUNCTION preserve_lease_contract_effects() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.lease_id IS DISTINCT FROM OLD.lease_id
    OR NEW.requested_by IS DISTINCT FROM OLD.requested_by OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.document_id IS NOT NULL AND NEW.document_id IS DISTINCT FROM OLD.document_id) THEN
    RAISE EXCEPTION 'Confirmed contract source is immutable';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS immutable_lease_contract_effects ON lease_contract_effects_outbox;
CREATE TRIGGER immutable_lease_contract_effects BEFORE UPDATE ON lease_contract_effects_outbox FOR EACH ROW EXECUTE FUNCTION preserve_lease_contract_effects();
-- A stale draft save must never reopen or rewrite an already confirmed version.
CREATE OR REPLACE FUNCTION preserve_confirmed_lease_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM lease_contract_effects_outbox WHERE lease_id=OLD.id) AND (
    NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.property_id IS DISTINCT FROM OLD.property_id
    OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id OR NEW.contract_type IS DISTINCT FROM OLD.contract_type
    OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
    OR NEW.confirmed_contract_text IS DISTINCT FROM OLD.confirmed_contract_text
    OR NEW.confirmed_contract_format IS DISTINCT FROM OLD.confirmed_contract_format
    OR NEW.version_number IS DISTINCT FROM OLD.version_number OR NEW.status='draft') THEN
    RAISE EXCEPTION 'Confirmed contract source requires a new revision';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS immutable_confirmed_lease_source ON leases;
CREATE TRIGGER immutable_confirmed_lease_source BEFORE UPDATE ON leases FOR EACH ROW EXECUTE FUNCTION preserve_confirmed_lease_source();
COMMIT;
