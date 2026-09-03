BEGIN;

ALTER TABLE pending_actions
  ADD COLUMN IF NOT EXISTS payload_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS execution_key UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

ALTER TABLE pending_actions
  DROP CONSTRAINT IF EXISTS chk_pending_actions_status;

-- Proposals created under the previous mutable/non-expiring contract cannot
-- be safely approved after this deployment. Preserve them for audit only.
UPDATE pending_actions
   SET status = 'expired', updated_at = NOW()
 WHERE status = 'pending'
   AND (payload_hash IS NULL OR execution_key IS NULL OR expires_at IS NULL);

UPDATE pending_actions action
   SET payload_hash = COALESCE(
         confirmation.payload_hash,
         encode(digest(action.payload::text, 'sha256'), 'hex')
       ),
       execution_key = COALESCE(action.execution_key, gen_random_uuid()),
       expires_at = COALESCE(
         confirmation.expires_at,
         action.created_at + INTERVAL '15 minutes'
       )
  FROM ai_tool_mutation_confirmations confirmation
 WHERE confirmation.id = action.source_confirmation_id
   AND (action.payload_hash IS NULL OR action.expires_at IS NULL);

UPDATE pending_actions
   SET payload_hash = COALESCE(
         payload_hash,
         encode(digest(payload::text, 'sha256'), 'hex')
       ),
       execution_key = COALESCE(execution_key, gen_random_uuid()),
       expires_at = COALESCE(expires_at, created_at + INTERVAL '15 minutes')
 WHERE payload_hash IS NULL OR execution_key IS NULL OR expires_at IS NULL;

ALTER TABLE pending_actions
  ALTER COLUMN payload_hash SET NOT NULL,
  ALTER COLUMN execution_key SET NOT NULL,
  ALTER COLUMN expires_at SET NOT NULL,
  ALTER COLUMN execution_key SET DEFAULT gen_random_uuid();

ALTER TABLE pending_actions
  ADD CONSTRAINT chk_pending_actions_status
    CHECK (status IN (
      'pending', 'approved', 'executing', 'rejected', 'executed', 'failed', 'expired'
    )),
  ADD CONSTRAINT ck_pending_actions_payload_hash
    CHECK (payload_hash ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_actions_execution_key
  ON pending_actions(execution_key);
CREATE INDEX IF NOT EXISTS idx_pending_actions_expiry
  ON pending_actions(expires_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION prevent_pending_action_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.source_communication_id IS DISTINCT FROM OLD.source_communication_id
     OR NEW.source_confirmation_id IS DISTINCT FROM OLD.source_confirmation_id
     OR NEW.tool_name IS DISTINCT FROM OLD.tool_name
     OR NEW.action_type IS DISTINCT FROM OLD.action_type
     OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
     OR NEW.summary IS DISTINCT FROM OLD.summary
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
     OR NEW.execution_key IS DISTINCT FROM OLD.execution_key
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'Pending action proposal fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pending_actions_immutable ON pending_actions;
CREATE TRIGGER trg_pending_actions_immutable
  BEFORE UPDATE ON pending_actions
  FOR EACH ROW EXECUTE FUNCTION prevent_pending_action_mutation();

COMMIT;
