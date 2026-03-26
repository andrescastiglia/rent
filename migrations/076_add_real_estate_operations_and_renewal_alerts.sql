-- Migration: 076_add_real_estate_operations_and_renewal_alerts.sql
-- Description: Differentiate property visits from maintenance tasks, classify payment activity, and configure lease renewal alerts.
-- Created at: 2026-03-26

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'property_visit_kind'
    ) THEN
        CREATE TYPE property_visit_kind AS ENUM ('visit', 'maintenance');
    END IF;
END $$;

ALTER TABLE property_visits
    ADD COLUMN IF NOT EXISTS kind property_visit_kind;

UPDATE property_visits
SET kind = CASE
    WHEN interested_profile_id IS NOT NULL
        OR COALESCE(has_offer, FALSE) = TRUE
        OR offer_amount IS NOT NULL
    THEN 'visit'::property_visit_kind
    ELSE 'maintenance'::property_visit_kind
END
WHERE kind IS NULL;

ALTER TABLE property_visits
    ALTER COLUMN kind SET DEFAULT 'visit'::property_visit_kind;

ALTER TABLE property_visits
    ALTER COLUMN kind SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_property_visits_property_kind_visited_at
    ON property_visits (property_id, kind, visited_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'payment_activity_type'
    ) THEN
        CREATE TYPE payment_activity_type AS ENUM (
            'monthly',
            'annual',
            'adjustment',
            'late_fee',
            'extraordinary'
        );
    END IF;
END $$;

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS activity_type payment_activity_type;

UPDATE payments
SET activity_type = 'monthly'::payment_activity_type
WHERE activity_type IS NULL;

ALTER TABLE payments
    ALTER COLUMN activity_type SET DEFAULT 'monthly'::payment_activity_type;

ALTER TABLE payments
    ALTER COLUMN activity_type SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_activity_type_payment_date
    ON payments (activity_type, payment_date DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'lease_renewal_alert_periodicity'
    ) THEN
        CREATE TYPE lease_renewal_alert_periodicity AS ENUM (
            'monthly',
            'four_months',
            'custom'
        );
    END IF;
END $$;

ALTER TABLE leases
    ADD COLUMN IF NOT EXISTS renewal_alert_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS renewal_alert_periodicity lease_renewal_alert_periodicity NOT NULL DEFAULT 'monthly',
    ADD COLUMN IF NOT EXISTS renewal_alert_custom_days INTEGER NULL,
    ADD COLUMN IF NOT EXISTS renewal_alert_last_sent_at TIMESTAMPTZ NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'leases_renewal_alert_custom_days_check'
    ) THEN
        ALTER TABLE leases
            ADD CONSTRAINT leases_renewal_alert_custom_days_check
            CHECK (
                renewal_alert_custom_days IS NULL
                OR renewal_alert_custom_days >= 1
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leases_end_date_renewal_alerts
    ON leases (end_date, renewal_alert_enabled, renewal_alert_periodicity)
    WHERE deleted_at IS NULL;
