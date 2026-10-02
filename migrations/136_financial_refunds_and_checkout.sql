BEGIN;
-- Preserve the former rate as an explicit, editable parameter with migration provenance.
UPDATE companies SET settings=jsonb_set(COALESCE(settings,'{}'::jsonb),'{financial}',
  COALESCE(settings->'financial','{}'::jsonb) || '{"commissionTaxRate":21,"commissionTaxRateSource":"legacy-policy-migration-136"}'::jsonb)
WHERE settings->'financial'->'commissionTaxRate' IS NULL;
ALTER TABLE commission_invoices ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2);

ALTER TABLE payment_gateway_transactions ADD COLUMN IF NOT EXISTS idempotency_key uuid;
ALTER TABLE payment_gateway_transactions ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES payments(id);
ALTER TABLE payment_gateway_transactions ADD COLUMN IF NOT EXISTS refunded_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0 AND refunded_amount <= amount);
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_request ON payment_gateway_transactions(company_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_payment ON payment_gateway_transactions(payment_id) WHERE payment_id IS NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0 AND refunded_amount <= amount);
ALTER TABLE payment_allocations ADD COLUMN IF NOT EXISTS refunded_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0 AND refunded_amount <= amount);
CREATE TABLE IF NOT EXISTS payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
  payment_id uuid NOT NULL REFERENCES payments(id), amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency varchar(3) NOT NULL, reference varchar(255) NOT NULL, reason text NOT NULL CHECK(length(reason)>=5),
  document_number varchar(100) NOT NULL UNIQUE, created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,payment_id,reference)
);
CREATE TABLE IF NOT EXISTS settlement_source_compensations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
  settlement_id uuid NOT NULL REFERENCES settlements(id), invoice_id uuid NOT NULL REFERENCES invoices(id),
  payment_id uuid REFERENCES payments(id), reference_id uuid NOT NULL,
  currency varchar(3) NOT NULL, collected_amount numeric(14,2) NOT NULL CHECK(collected_amount>0), gross_amount numeric(14,2) NOT NULL CHECK(gross_amount>=0),
  commission_amount numeric(14,2) NOT NULL CHECK(commission_amount>=0),
  net_amount numeric(14,2) NOT NULL CHECK(net_amount>=0),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(settlement_id,invoice_id,reference_id),
  CHECK(gross_amount=commission_amount+net_amount)
);
CREATE INDEX IF NOT EXISTS idx_settlement_compensations_company ON settlement_source_compensations(company_id,settlement_id);
ALTER TABLE sale_receipts ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE sale_receipts ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(id);
ALTER TABLE sale_receipts ADD COLUMN IF NOT EXISTS cancellation_reason text;
CREATE TABLE IF NOT EXISTS sale_receipt_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
  agreement_id uuid NOT NULL REFERENCES sale_agreements(id), receipt_id uuid NOT NULL UNIQUE REFERENCES sale_receipts(id),
  cancelled_by uuid REFERENCES users(id), reason text NOT NULL CHECK(length(reason)>=5),
  amount numeric(14,2) NOT NULL CHECK(amount>0), currency varchar(3) NOT NULL,
  previous_paid numeric(14,2) NOT NULL, resulting_paid numeric(14,2) NOT NULL CHECK(resulting_paid>=0),
  created_at timestamptz NOT NULL DEFAULT now(), CHECK(previous_paid-resulting_paid=amount)
);
CREATE TABLE IF NOT EXISTS invoice_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
  invoice_id uuid NOT NULL UNIQUE REFERENCES invoices(id), original_status text NOT NULL,
  total_amount numeric(14,2) NOT NULL, paid_amount numeric(14,2) NOT NULL, currency varchar(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS commission_invoice_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
  commission_invoice_id uuid NOT NULL REFERENCES commission_invoices(id), invoice_id uuid NOT NULL REFERENCES invoices(id),
  amount numeric(14,2) NOT NULL, paid_amount numeric(14,2) NOT NULL, currency varchar(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(commission_invoice_id,invoice_id)
);
CREATE OR REPLACE FUNCTION preserve_financial_correction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'A financial correction is immutable'; END; $$;
DROP TRIGGER IF EXISTS immutable_payment_refund ON payment_refunds;
CREATE TRIGGER immutable_payment_refund BEFORE UPDATE OR DELETE ON payment_refunds FOR EACH ROW EXECUTE FUNCTION preserve_financial_correction();
DROP TRIGGER IF EXISTS immutable_settlement_compensation ON settlement_source_compensations;
CREATE TRIGGER immutable_settlement_compensation BEFORE UPDATE OR DELETE ON settlement_source_compensations FOR EACH ROW EXECUTE FUNCTION preserve_financial_correction();
DROP TRIGGER IF EXISTS immutable_sale_receipt_cancellation ON sale_receipt_cancellations;
CREATE TRIGGER immutable_sale_receipt_cancellation BEFORE UPDATE OR DELETE ON sale_receipt_cancellations FOR EACH ROW EXECUTE FUNCTION preserve_financial_correction();
DROP TRIGGER IF EXISTS immutable_invoice_cancellation ON invoice_cancellations;
CREATE TRIGGER immutable_invoice_cancellation BEFORE UPDATE OR DELETE ON invoice_cancellations FOR EACH ROW EXECUTE FUNCTION preserve_financial_correction();
DROP TRIGGER IF EXISTS immutable_commission_correction ON commission_invoice_corrections;
CREATE TRIGGER immutable_commission_correction BEFORE UPDATE OR DELETE ON commission_invoice_corrections FOR EACH ROW EXECUTE FUNCTION preserve_financial_correction();
COMMIT;
