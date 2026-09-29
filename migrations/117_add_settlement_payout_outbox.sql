BEGIN;
CREATE TABLE IF NOT EXISTS settlement_payout_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  settlement_id uuid NOT NULL UNIQUE REFERENCES settlements(id),
  owner_id uuid NOT NULL REFERENCES owners(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  request jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','dispatching','awaiting','completed','failed','needs_review','reversed')),
  payout_id text UNIQUE,
  transaction_id text UNIQUE,
  remote_status text,
  remote_detail text,
  remote_updated_at timestamptz,
  error_code text,
  attempts integer NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claim_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(request) = 'object' AND request ?& ARRAY['idempotencyKey','externalReference','amount','currency']),
  CHECK ((payout_id IS NULL) = (transaction_id IS NULL)),
  CHECK (request->>'idempotencyKey' = id::text),
  CHECK (request->>'externalReference' = 'rent_settlement_' || settlement_id::text),
  CHECK (request->>'currency' = 'ARS')
);
CREATE INDEX IF NOT EXISTS idx_settlement_payout_due ON settlement_payout_outbox(next_attempt_at,id)
  WHERE status IN ('queued','dispatching','awaiting','completed');
CREATE INDEX IF NOT EXISTS idx_settlement_payout_company ON settlement_payout_outbox(company_id,settlement_id);
CREATE TABLE IF NOT EXISTS settlement_payout_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  settlement_id uuid NOT NULL REFERENCES settlements(id),
  payout_job_id uuid NOT NULL REFERENCES settlement_payout_outbox(id),
  kind text NOT NULL CHECK (kind IN ('transfer','reversal')),
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency = 'ARS'),
  transaction_id text NOT NULL,
  provider_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payout_job_id,kind)
);
CREATE TABLE IF NOT EXISTS settlement_payout_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  payout_job_id uuid NOT NULL REFERENCES settlement_payout_outbox(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL CHECK (action IN ('retry','link','refresh')),
  reason text NOT NULL,
  payout_id text,
  transaction_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION preserve_settlement_payout_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.company_id,NEW.settlement_id,NEW.owner_id,NEW.requested_by,NEW.request,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.company_id,OLD.settlement_id,OLD.owner_id,OLD.requested_by,OLD.request,OLD.created_at) THEN
    RAISE EXCEPTION 'A settlement payout request is immutable';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS immutable_settlement_payout_request ON settlement_payout_outbox;
CREATE TRIGGER immutable_settlement_payout_request BEFORE UPDATE ON settlement_payout_outbox
  FOR EACH ROW EXECUTE FUNCTION preserve_settlement_payout_request();
COMMIT;
