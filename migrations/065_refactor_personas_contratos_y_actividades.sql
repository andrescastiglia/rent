-- =============================================================================
-- Migration: 065_refactor_personas_contratos_y_actividades.sql
-- Description: Remove leasing mode usage, add person activities/reservations,
--              refactor lease contracts and add credit notes with PDF support.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Remove leasing usage from properties/interested and normalize states
-- -----------------------------------------------------------------------------

UPDATE properties
SET operations = array_remove(operations, 'leasing'::property_operation)
WHERE operations IS NOT NULL
  AND operations @> ARRAY['leasing'::property_operation];

UPDATE properties
SET operations = ARRAY['rent'::property_operation]
WHERE operations IS NULL
   OR cardinality(operations) = 0;

UPDATE interested_profiles
SET operations = array_remove(operations, 'leasing'::interested_operation)
WHERE operations IS NOT NULL
  AND operations @> ARRAY['leasing'::interested_operation];

UPDATE interested_profiles
SET operations = ARRAY['rent'::interested_operation]
WHERE operations IS NULL
   OR cardinality(operations) = 0;

UPDATE interested_profiles
SET operation = 'rent'::interested_operation
WHERE operation = 'leasing'::interested_operation;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'property_operation_state'
          AND e.enumlabel = 'reserved'
    ) THEN
        -- already exists
        NULL;
    ELSE
        ALTER TYPE property_operation_state ADD VALUE 'reserved';
    END IF;
END $$;

UPDATE properties
SET operation_state = 'rented'::property_operation_state
WHERE operation_state::text = 'leased';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'interested_status'
          AND e.enumlabel = 'interested'
    ) THEN
        NULL;
    ELSE
        ALTER TYPE interested_status ADD VALUE 'interested';
    END IF;
END $$;

UPDATE interested_profiles
SET status = 'interested'::interested_status
WHERE status::text = 'new';

ALTER TABLE interested_profiles
    ALTER COLUMN status SET DEFAULT 'interested'::interested_status;

-- -----------------------------------------------------------------------------
-- 2) Refactor leases/contracts model
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'contract_type'
    ) THEN
        CREATE TYPE contract_type AS ENUM ('rental', 'sale');
    END IF;
END $$;

ALTER TABLE leases
    ADD COLUMN IF NOT EXISTS contract_type contract_type NOT NULL DEFAULT 'rental',
    ADD COLUMN IF NOT EXISTS property_id UUID,
    ADD COLUMN IF NOT EXISTS buyer_profile_id UUID,
    ADD COLUMN IF NOT EXISTS fiscal_value NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS contract_pdf_url TEXT;

UPDATE leases l
SET property_id = u.property_id
FROM units u
WHERE l.unit_id = u.id
  AND l.property_id IS NULL;

ALTER TABLE leases
    ALTER COLUMN tenant_id DROP NOT NULL,
    ALTER COLUMN start_date DROP NOT NULL,
    ALTER COLUMN end_date DROP NOT NULL,
    ALTER COLUMN monthly_rent DROP NOT NULL;

ALTER TABLE leases
    DROP CONSTRAINT IF EXISTS fk_leases_unit_id,
    DROP CONSTRAINT IF EXISTS leases_unit_id_fkey;

DROP INDEX IF EXISTS idx_leases_unit_id;

ALTER TABLE leases
    DROP COLUMN IF EXISTS unit_id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'leases'
          AND constraint_name = 'fk_leases_property_id'
    ) THEN
        ALTER TABLE leases
            ADD CONSTRAINT fk_leases_property_id
            FOREIGN KEY (property_id) REFERENCES properties(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'leases'
          AND constraint_name = 'fk_leases_buyer_profile_id'
    ) THEN
        ALTER TABLE leases
            ADD CONSTRAINT fk_leases_buyer_profile_id
            FOREIGN KEY (buyer_profile_id) REFERENCES interested_profiles(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'lease_status_v2'
    ) THEN
        CREATE TYPE lease_status_v2 AS ENUM ('draft', 'active', 'finalized');
    END IF;
END $$;

ALTER TABLE leases
    ADD COLUMN IF NOT EXISTS status_v2 lease_status_v2;

UPDATE leases
SET status_v2 = CASE status::text
    WHEN 'draft' THEN 'draft'::lease_status_v2
    WHEN 'active' THEN 'active'::lease_status_v2
    ELSE 'finalized'::lease_status_v2
END
WHERE status_v2 IS NULL;

ALTER TABLE leases
    ALTER COLUMN status_v2 SET NOT NULL,
    ALTER COLUMN status_v2 SET DEFAULT 'draft'::lease_status_v2;

ALTER TABLE leases
    DROP COLUMN status;

ALTER TABLE leases
    RENAME COLUMN status_v2 TO status;

DROP TYPE IF EXISTS lease_status;
ALTER TYPE lease_status_v2 RENAME TO lease_status;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'leases_contract_type_required_fields_chk'
    ) THEN
        ALTER TABLE leases
            ADD CONSTRAINT leases_contract_type_required_fields_chk
            CHECK (
                (contract_type = 'rental'
                 AND tenant_id IS NOT NULL
                 AND start_date IS NOT NULL
                 AND end_date IS NOT NULL
                 AND monthly_rent IS NOT NULL)
                OR
                (contract_type = 'sale'
                 AND buyer_profile_id IS NOT NULL
                 AND fiscal_value IS NOT NULL)
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'leases_sale_specific_fields_chk'
    ) THEN
        ALTER TABLE leases
            ADD CONSTRAINT leases_sale_specific_fields_chk
            CHECK (
                contract_type <> 'sale'
                OR (
                    COALESCE(late_fee_value, 0) = 0
                    AND (late_fee_type = 'none'::late_fee_type OR late_fee_type IS NULL)
                    AND COALESCE(adjustment_value, 0) = 0
                )
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leases_property_id ON leases(property_id);
CREATE INDEX IF NOT EXISTS idx_leases_buyer_profile_id ON leases(buyer_profile_id);
CREATE INDEX IF NOT EXISTS idx_leases_contract_type ON leases(contract_type);

-- -----------------------------------------------------------------------------
-- 3) Owner activities
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'owner_activity_type'
    ) THEN
        CREATE TYPE owner_activity_type AS ENUM (
            'call',
            'task',
            'note',
            'email',
            'whatsapp',
            'visit',
            'reserve'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'owner_activity_status'
    ) THEN
        CREATE TYPE owner_activity_status AS ENUM ('pending', 'completed', 'cancelled');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS owner_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    owner_id UUID NOT NULL REFERENCES owners(id),
    property_id UUID NULL REFERENCES properties(id),
    type owner_activity_type NOT NULL,
    status owner_activity_status NOT NULL DEFAULT 'pending',
    subject VARCHAR(200) NOT NULL,
    body TEXT NULL,
    due_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id UUID NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_owner_activities_owner_id
    ON owner_activities(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_activities_company_id
    ON owner_activities(company_id);
CREATE INDEX IF NOT EXISTS idx_owner_activities_due_at
    ON owner_activities(due_at);
CREATE INDEX IF NOT EXISTS idx_owner_activities_status
    ON owner_activities(status);

CREATE TRIGGER update_owner_activities_updated_at
    BEFORE UPDATE ON owner_activities
    FOR EACH ROW
    EXECUTE FUNCTION functions.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 4) Property reservations (person <-> property)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'property_reservation_status'
    ) THEN
        CREATE TYPE property_reservation_status AS ENUM ('active', 'released', 'converted');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS property_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    property_id UUID NOT NULL REFERENCES properties(id),
    interested_profile_id UUID NOT NULL REFERENCES interested_profiles(id),
    status property_reservation_status NOT NULL DEFAULT 'active',
    activity_source VARCHAR(30) NOT NULL DEFAULT 'activity',
    notes TEXT NULL,
    reserved_by_user_id UUID NULL REFERENCES users(id),
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_property_reservations_active_pair
    ON property_reservations(property_id, interested_profile_id)
    WHERE status = 'active'::property_reservation_status
      AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_property_reservations_property_id
    ON property_reservations(property_id);
CREATE INDEX IF NOT EXISTS idx_property_reservations_interested_profile_id
    ON property_reservations(interested_profile_id);

CREATE TRIGGER update_property_reservations_updated_at
    BEFORE UPDATE ON property_reservations
    FOR EACH ROW
    EXECUTE FUNCTION functions.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 5) Credit notes with PDF support
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'credit_note_status'
    ) THEN
        CREATE TYPE credit_note_status AS ENUM ('draft', 'issued', 'cancelled');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS credit_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    payment_id UUID NULL REFERENCES payments(id),
    tenant_account_id UUID NULL REFERENCES tenant_accounts(id),
    note_number VARCHAR(50) NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'ARS',
    reason TEXT NULL,
    status credit_note_status NOT NULL DEFAULT 'issued',
    pdf_url TEXT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_credit_notes_note_number UNIQUE(note_number)
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_id
    ON credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_payment_id
    ON credit_notes(payment_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_tenant_account_id
    ON credit_notes(tenant_account_id);

CREATE TRIGGER update_credit_notes_updated_at
    BEFORE UPDATE ON credit_notes
    FOR EACH ROW
    EXECUTE FUNCTION functions.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 6) Optional binary storage for PDFs in documents (batch support)
-- -----------------------------------------------------------------------------

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS file_data BYTEA;
