ALTER TYPE communication_event ADD VALUE IF NOT EXISTS 'settlement_reversed';
BEGIN;
ALTER TABLE settlement_payout_movements ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES documents(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_payout_document ON settlement_payout_movements(document_id) WHERE document_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS settlement_payout_effects_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  movement_id uuid NOT NULL UNIQUE REFERENCES settlement_payout_movements(id),
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','completed','dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_settlement_payout_effects_due ON settlement_payout_effects_outbox(next_attempt_at,created_at) WHERE status='queued';
CREATE OR REPLACE FUNCTION preserve_settlement_payout_effect_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.company_id,NEW.movement_id,NEW.snapshot,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.company_id,OLD.movement_id,OLD.snapshot,OLD.created_at) THEN
    RAISE EXCEPTION 'A payout receipt snapshot is immutable';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS immutable_settlement_payout_effect_snapshot ON settlement_payout_effects_outbox;
CREATE TRIGGER immutable_settlement_payout_effect_snapshot BEFORE UPDATE ON settlement_payout_effects_outbox
  FOR EACH ROW EXECUTE FUNCTION preserve_settlement_payout_effect_snapshot();
-- No historical notices or transfers are queued by this migration.
COMMIT;
