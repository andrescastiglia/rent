ALTER TABLE pending_actions ADD COLUMN IF NOT EXISTS review jsonb;
ALTER TABLE ai_tool_mutation_confirmations ADD COLUMN IF NOT EXISTS review jsonb;

-- Legacy proposals did not capture the observed state; require a fresh review.
UPDATE pending_actions SET status='expired', updated_at=NOW() WHERE status='pending' AND review IS NULL;
UPDATE ai_tool_mutation_confirmations SET status='expired' WHERE status='pending' AND review IS NULL;

CREATE OR REPLACE FUNCTION protect_mutation_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.review IS DISTINCT FROM OLD.review THEN
    RAISE EXCEPTION 'Mutation review is immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_pending_action_review ON pending_actions;
CREATE TRIGGER trg_pending_action_review BEFORE UPDATE ON pending_actions FOR EACH ROW EXECUTE FUNCTION protect_mutation_review();
DROP TRIGGER IF EXISTS trg_confirmation_review ON ai_tool_mutation_confirmations;
CREATE TRIGGER trg_confirmation_review BEFORE UPDATE ON ai_tool_mutation_confirmations FOR EACH ROW EXECUTE FUNCTION protect_mutation_review();
