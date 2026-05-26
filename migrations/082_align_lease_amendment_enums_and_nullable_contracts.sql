-- =============================================================================
-- Migration: 082_align_lease_amendment_enums_and_nullable_contracts.sql
-- Description: Align database contracts with current TypeORM entities for lease
--              amendments and nullable runtime fields.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Lease amendment enums
-- -----------------------------------------------------------------------------
-- Current runtime accepts these change types:
-- rent_increase, rent_decrease, extension, early_termination,
-- clause_modification, guarantor_change, other.
--
-- Older databases used: rent_adjustment, term_extension, term_reduction,
-- tenant_addition, tenant_removal, clause_modification, other.
--
-- Convert through text so the enum can be rebuilt with the exact runtime values.
ALTER TABLE lease_amendments
    ALTER COLUMN change_type TYPE TEXT
    USING CASE change_type::TEXT
        WHEN 'rent_adjustment' THEN 'rent_increase'
        WHEN 'term_extension' THEN 'extension'
        WHEN 'term_reduction' THEN 'early_termination'
        WHEN 'tenant_addition' THEN 'other'
        WHEN 'tenant_removal' THEN 'other'
        WHEN 'rent_increase' THEN 'rent_increase'
        WHEN 'rent_decrease' THEN 'rent_decrease'
        WHEN 'extension' THEN 'extension'
        WHEN 'early_termination' THEN 'early_termination'
        WHEN 'clause_modification' THEN 'clause_modification'
        WHEN 'guarantor_change' THEN 'guarantor_change'
        ELSE 'other'
    END;

ALTER TABLE lease_amendments
    ALTER COLUMN status DROP DEFAULT,
    ALTER COLUMN status TYPE TEXT
    USING CASE status::TEXT
        WHEN 'superseded' THEN 'cancelled'
        WHEN 'draft' THEN 'draft'
        WHEN 'pending_approval' THEN 'pending_approval'
        WHEN 'approved' THEN 'approved'
        WHEN 'rejected' THEN 'rejected'
        WHEN 'cancelled' THEN 'cancelled'
        ELSE 'rejected'
    END;

DROP TYPE IF EXISTS amendment_change_type;
CREATE TYPE amendment_change_type AS ENUM (
    'rent_increase',
    'rent_decrease',
    'extension',
    'early_termination',
    'clause_modification',
    'guarantor_change',
    'other'
);

DROP TYPE IF EXISTS amendment_status;
CREATE TYPE amendment_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'cancelled'
);

ALTER TABLE lease_amendments
    ALTER COLUMN change_type TYPE amendment_change_type
    USING change_type::amendment_change_type,
    ALTER COLUMN status TYPE amendment_status
    USING status::amendment_status,
    ALTER COLUMN status SET DEFAULT 'draft';

-- -----------------------------------------------------------------------------
-- Nullable fields accepted by runtime entities
-- -----------------------------------------------------------------------------
ALTER TABLE users
    ALTER COLUMN email DROP NOT NULL;

ALTER TABLE settlements
    ALTER COLUMN scheduled_date DROP NOT NULL;
