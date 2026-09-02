BEGIN;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  previous_invoice_status invoice_status NOT NULL,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_allocations_payment_invoice
    UNIQUE (company_id, payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_active
  ON payment_allocations (company_id, payment_id)
  WHERE reversed_at IS NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS allocations_recorded boolean NOT NULL DEFAULT false;

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_receipts_payment
  ON receipts (payment_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_notes_payment_invoice
  ON credit_notes (company_id, payment_id, invoice_id)
  WHERE payment_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_movements_reference
  ON tenant_account_movements (
    tenant_account_id,
    reference_type,
    reference_id,
    movement_type
  )
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

COMMIT;
