BEGIN;
ALTER TABLE lease_amendments
  ADD COLUMN IF NOT EXISTS application_status varchar(20) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS application_error text,
  ADD COLUMN IF NOT EXISTS last_application_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS application_snapshot jsonb;
-- Historical approvals did not apply contract values. Never activate them silently.
UPDATE lease_amendments SET application_status='legacy_review',
  application_error='Historical approval requires review before automatic application'
WHERE status='approved' AND application_status='none';
CREATE INDEX IF NOT EXISTS lease_amendments_due_idx ON lease_amendments(effective_date,lease_id)
  WHERE deleted_at IS NULL AND status='approved' AND application_status IN ('pending','error');
CREATE OR REPLACE FUNCTION protect_approved_amendment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='approved' AND ROW(NEW.lease_id,NEW.company_id,NEW.amendment_number,NEW.effective_date,NEW.change_type,NEW.new_values,NEW.approved_by,NEW.approved_at)
    IS DISTINCT FROM ROW(OLD.lease_id,OLD.company_id,OLD.amendment_number,OLD.effective_date,OLD.change_type,OLD.new_values,OLD.approved_by,OLD.approved_at) THEN
    RAISE EXCEPTION 'Approved amendment terms are immutable';
  END IF;
  IF OLD.application_status='applied' AND ROW(NEW.status,NEW.application_status,NEW.applied_at,NEW.application_snapshot)
    IS DISTINCT FROM ROW(OLD.status,OLD.application_status,OLD.applied_at,OLD.application_snapshot) THEN
    RAISE EXCEPTION 'Applied amendment evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lease_amendments_protect_approval ON lease_amendments;
CREATE TRIGGER lease_amendments_protect_approval BEFORE UPDATE ON lease_amendments
FOR EACH ROW EXECUTE FUNCTION protect_approved_amendment();
COMMIT;
