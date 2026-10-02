BEGIN;
CREATE TABLE IF NOT EXISTS company_financial_settings_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),
  changed_by uuid NOT NULL REFERENCES users(id),previous_settings jsonb NOT NULL,new_settings jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(jsonb_typeof(previous_settings)='object' AND jsonb_typeof(new_settings)='object')
);
CREATE INDEX IF NOT EXISTS idx_company_financial_settings_audit ON company_financial_settings_audit(company_id,created_at,id);
DROP TRIGGER IF EXISTS immutable_company_financial_settings_audit ON company_financial_settings_audit;
CREATE TRIGGER immutable_company_financial_settings_audit BEFORE UPDATE OR DELETE ON company_financial_settings_audit
FOR EACH ROW EXECUTE FUNCTION preserve_financial_correction();
COMMIT;
