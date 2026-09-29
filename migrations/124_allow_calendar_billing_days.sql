BEGIN;
ALTER TABLE leases DROP CONSTRAINT IF EXISTS leases_payment_due_day_check;
ALTER TABLE leases ADD CONSTRAINT leases_payment_due_day_check CHECK (payment_due_day BETWEEN 1 AND 31);
ALTER TABLE leases DROP CONSTRAINT IF EXISTS leases_billing_day_check;
ALTER TABLE leases ADD CONSTRAINT leases_billing_day_check CHECK (billing_day IS NULL OR billing_day BETWEEN 1 AND 31);
COMMIT;
