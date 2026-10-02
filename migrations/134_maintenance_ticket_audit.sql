BEGIN;
CREATE TABLE IF NOT EXISTS maintenance_ticket_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  ticket_id uuid NOT NULL REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL CHECK(action IN ('create','update','delete','comment')),
  before_snapshot jsonb,
  after_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS maintenance_ticket_audit_history_idx
  ON maintenance_ticket_audit(company_id,ticket_id,created_at,id);
CREATE OR REPLACE FUNCTION protect_maintenance_ticket_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Maintenance audit history cannot be overwritten';
END;
$$;
DROP TRIGGER IF EXISTS maintenance_ticket_audit_no_update ON maintenance_ticket_audit;
CREATE TRIGGER maintenance_ticket_audit_no_update BEFORE UPDATE ON maintenance_ticket_audit
FOR EACH ROW EXECUTE FUNCTION protect_maintenance_ticket_audit();
COMMIT;
