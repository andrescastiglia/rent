-- =============================================================================
-- Migration: 110_unify_people_contract_lifecycle.sql
-- Description: Additive migration for multi-role people, a canonical contract
--              lifecycle, and sale-agreement links to the shared contract.
--              Existing identifiers and business records are preserved.
-- =============================================================================

-- A user row remains the canonical person/access identity during the
-- compatibility period. `role` is the primary legacy role; `roles` is the
-- authoritative set and allows one person to be owner, tenant and/or buyer.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS roles user_role[] NOT NULL DEFAULT '{}'::user_role[];

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS access_requested boolean NOT NULL DEFAULT true;

UPDATE users
SET roles = ARRAY[role]::user_role[]
WHERE cardinality(roles) = 0;

CREATE OR REPLACE FUNCTION normalize_user_roles()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.roles IS NULL OR cardinality(NEW.roles) = 0 THEN
        NEW.roles := ARRAY[NEW.role]::user_role[];
    ELSIF NOT (NEW.role = ANY(NEW.roles)) THEN
        NEW.roles := array_prepend(NEW.role, NEW.roles);
    END IF;
    NEW.roles := ARRAY(
        SELECT DISTINCT role_value
        FROM unnest(NEW.roles) AS expanded_roles(role_value)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_user_roles ON users;
CREATE TRIGGER trg_normalize_user_roles
    BEFORE INSERT OR UPDATE OF role, roles
    ON users
    FOR EACH ROW
    EXECUTE FUNCTION normalize_user_roles();

CREATE INDEX IF NOT EXISTS idx_users_roles ON users USING GIN (roles);

ALTER TABLE interested_profiles
    ADD COLUMN IF NOT EXISTS verified_monthly_income NUMERIC(12, 2);

ALTER TABLE interested_profiles
    DROP CONSTRAINT IF EXISTS interested_verified_monthly_income_chk,
    ADD CONSTRAINT interested_verified_monthly_income_chk
        CHECK (verified_monthly_income IS NULL OR verified_monthly_income >= 0);

-- Contract lifecycle and signature workflow are independent dimensions.
ALTER TABLE leases
    ADD COLUMN IF NOT EXISTS signature_status VARCHAR(30)
        NOT NULL DEFAULT 'not_started';

UPDATE leases
SET signature_status = CASE status::text
        WHEN 'pending_signature' THEN 'pending'
        WHEN 'signed' THEN 'signed'
        ELSE signature_status
    END,
    status = CASE status::text
        WHEN 'pending_signature' THEN 'draft'::lease_status
        WHEN 'signed' THEN 'draft'::lease_status
        ELSE status
    END
WHERE status::text IN ('pending_signature', 'signed');

ALTER TABLE leases
    DROP CONSTRAINT IF EXISTS leases_lifecycle_status_chk,
    DROP CONSTRAINT IF EXISTS leases_signature_status_chk;

ALTER TABLE leases
    ADD CONSTRAINT leases_lifecycle_status_chk
        CHECK (status::text IN ('draft', 'active', 'finalized')),
    ADD CONSTRAINT leases_signature_status_chk
        CHECK (signature_status IN (
            'not_started', 'pending', 'signed', 'declined', 'voided', 'expired'
        ));

-- Sale-specific payment terms extend a canonical sale contract. Old sale
-- agreements remain readable with NULL links until an operator maps them to a
-- property; all newly created agreements receive both links atomically.
ALTER TABLE sale_agreements
    ADD COLUMN IF NOT EXISTS property_id UUID,
    ADD COLUMN IF NOT EXISTS contract_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sale_agreements_property_id_fkey'
    ) THEN
        ALTER TABLE sale_agreements
            ADD CONSTRAINT sale_agreements_property_id_fkey
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sale_agreements_contract_id_fkey'
    ) THEN
        ALTER TABLE sale_agreements
            ADD CONSTRAINT sale_agreements_contract_id_fkey
            FOREIGN KEY (contract_id) REFERENCES leases(id) ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sale_agreements_property_id
    ON sale_agreements(property_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_agreements_contract_id_unique
    ON sale_agreements(contract_id) WHERE contract_id IS NOT NULL;

-- Compatibility read model: new integrations use `contracts`; legacy code can
-- keep using `leases` until every consumer has migrated.
CREATE OR REPLACE VIEW contracts AS SELECT * FROM leases;

-- Enforce the canonical direct property link for new contracts while keeping
-- unmapped legacy rows operable until the assisted inventory is completed.
CREATE OR REPLACE FUNCTION validate_contract_property_link()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.property_id IS NULL AND (
        TG_OP = 'INSERT' OR OLD.property_id IS DISTINCT FROM NEW.property_id
    ) THEN
        RAISE EXCEPTION 'Contract % requires property_id', NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_contract_property_link ON leases;
CREATE TRIGGER trg_validate_contract_property_link
    BEFORE INSERT OR UPDATE OF property_id
    ON leases
    FOR EACH ROW
    EXECUTE FUNCTION validate_contract_property_link();

-- New installment plans must extend the same sale contract, property, buyer
-- and company. Legacy unlinked plans can still receive payments until mapped.
CREATE OR REPLACE FUNCTION validate_sale_agreement_contract_link()
RETURNS TRIGGER AS $$
DECLARE
    v_contract_company_id UUID;
    v_contract_property_id UUID;
    v_contract_buyer_id UUID;
    v_contract_type contract_type;
BEGIN
    IF NEW.contract_id IS NULL OR NEW.property_id IS NULL THEN
        IF TG_OP = 'INSERT'
           OR OLD.contract_id IS DISTINCT FROM NEW.contract_id
           OR OLD.property_id IS DISTINCT FROM NEW.property_id THEN
            RAISE EXCEPTION 'Sale agreement % requires contract_id and property_id', NEW.id;
        END IF;
        RETURN NEW;
    END IF;

    SELECT company_id, property_id, buyer_id, contract_type
      INTO v_contract_company_id, v_contract_property_id,
           v_contract_buyer_id, v_contract_type
      FROM leases
     WHERE id = NEW.contract_id
       AND deleted_at IS NULL;

    IF v_contract_company_id IS NULL THEN
        RAISE EXCEPTION 'Sale agreement contract % does not exist', NEW.contract_id;
    END IF;
    IF v_contract_type IS DISTINCT FROM 'sale'::contract_type
       OR v_contract_company_id IS DISTINCT FROM NEW.company_id
       OR v_contract_property_id IS DISTINCT FROM NEW.property_id
       OR v_contract_buyer_id IS DISTINCT FROM NEW.buyer_id THEN
        RAISE EXCEPTION 'Sale agreement % must match its sale contract', NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_sale_agreement_contract_link
    ON sale_agreements;
CREATE TRIGGER trg_validate_sale_agreement_contract_link
    BEFORE INSERT OR UPDATE OF contract_id, property_id, buyer_id, company_id
    ON sale_agreements
    FOR EACH ROW
    EXECUTE FUNCTION validate_sale_agreement_contract_link();

-- Tenant integrity now validates membership in the role set rather than the
-- single legacy primary role.
CREATE OR REPLACE FUNCTION validate_tenant_user_role()
RETURNS TRIGGER AS $$
DECLARE
    v_user_roles user_role[];
    v_user_company_id UUID;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT u.roles, u.company_id
    INTO v_user_roles, v_user_company_id
    FROM users u
    WHERE u.id = NEW.user_id
      AND u.deleted_at IS NULL;

    IF v_user_roles IS NULL THEN
        RAISE EXCEPTION 'Tenant user % does not exist or is deleted', NEW.user_id;
    END IF;
    IF NOT ('tenant'::user_role = ANY(v_user_roles)) THEN
        RAISE EXCEPTION 'Tenant user % must include role tenant', NEW.user_id;
    END IF;
    IF v_user_company_id IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'Tenant company % must match user company %', NEW.company_id, v_user_company_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_rental_lease_tenant_consistency()
RETURNS TRIGGER AS $$
DECLARE
    v_tenant_company_id UUID;
    v_tenant_user_roles user_role[];
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.contract_type = 'rental'::contract_type THEN
        IF NEW.tenant_id IS NULL THEN
            RAISE EXCEPTION 'Rental contract % requires tenant_id', NEW.id;
        END IF;

        SELECT t.company_id, u.roles
        INTO v_tenant_company_id, v_tenant_user_roles
        FROM tenants t
        JOIN users u ON u.id = t.user_id
        WHERE t.id = NEW.tenant_id
          AND t.deleted_at IS NULL
          AND u.deleted_at IS NULL;

        IF v_tenant_company_id IS NULL THEN
            RAISE EXCEPTION 'Rental contract tenant % does not exist or is deleted', NEW.tenant_id;
        END IF;
        IF NOT ('tenant'::user_role = ANY(v_tenant_user_roles)) THEN
            RAISE EXCEPTION 'Rental contract tenant % must include role tenant', NEW.tenant_id;
        END IF;
        IF v_tenant_company_id IS DISTINCT FROM NEW.company_id THEN
            RAISE EXCEPTION 'Rental contract company % must match tenant company %', NEW.company_id, v_tenant_company_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN users.roles IS
    'All simultaneous roles held by the person; users.role is the legacy primary role.';
COMMENT ON COLUMN leases.signature_status IS
    'Signature workflow state, independent from draft/active/finalized lifecycle.';
COMMENT ON COLUMN sale_agreements.contract_id IS
    'Canonical sale contract; sale_agreements stores installment/payment-plan details.';
