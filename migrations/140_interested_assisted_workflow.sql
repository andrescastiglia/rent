ALTER TABLE interested_profiles ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(40);
CREATE TABLE IF NOT EXISTS interested_workflow_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id),
  actor_id UUID NOT NULL REFERENCES users(id),
  operation VARCHAR(80) NOT NULL,
  evidence JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interested_workflow_audit_company ON interested_workflow_audit(company_id,created_at DESC);
DROP TRIGGER IF EXISTS immutable_interested_workflow_audit ON interested_workflow_audit;
CREATE TRIGGER immutable_interested_workflow_audit BEFORE UPDATE OR DELETE ON interested_workflow_audit FOR EACH ROW EXECUTE FUNCTION preserve_financial_correction();
